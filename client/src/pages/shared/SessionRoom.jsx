import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  File,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  ScreenShareOff,
  Send,
  Upload,
  Video,
  VideoOff,
  Volume2,
  UsersRound,
} from 'lucide-react';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { sessionService } from '../../services/session.service.js';
import { connectToSessionRoom } from '../../services/sessionRoom.service.js';
import { tokenStorage } from '../../utils/tokenStorage.js';
import { getErrorMessage } from '../../utils/errors.js';

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const formatFileSize = (size) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`;
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const readableError = (error, fallback) =>
  error?.response || error?.request || error?.code === 'ECONNABORTED'
    ? getErrorMessage(error, fallback)
    : error instanceof Error && error.message
      ? error.message
      : fallback;

function emitAck(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, ...args, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error('The room server did not respond. Check your connection and try again.'));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

function VideoStage({ stream, label, muted = true, kind = 'screen' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        aria-label={kind === 'screen' ? `Screen shared by ${label}` : `Camera video from ${label}`}
        className={kind === 'camera' ? 'h-full w-full object-cover' : 'max-h-full max-w-full rounded-lg object-contain'}
      />
      <p className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
        {kind === 'screen' ? `${label} is sharing their screen` : label}
      </p>
    </div>
  );
}

function AudioOutput({ stream, onBlocked, elementKey, registerElement }) {
  const audioRef = useRef(null);

  useEffect(() => {
    registerElement(elementKey, audioRef.current);
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((error) => {
        onBlocked(error.name === 'NotAllowedError'
          ? 'Your browser is blocking audio playback. Click in the room to allow sound.'
          : 'Unable to play participant audio.');
      });
    }
    return () => registerElement(elementKey, null);
  }, [elementKey, onBlocked, registerElement, stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}


export default function SessionRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [remoteMedia, setRemoteMedia] = useState({});
  const [speakingParticipantIds, setSpeakingParticipantIds] = useState(() => new Set());
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [audioNeedsGesture, setAudioNeedsGesture] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [screenSharerId, setScreenSharerId] = useState(null);
  const [mediaConfigurationWarning, setMediaConfigurationWarning] = useState('');
  const [roomSettings, setRoomSettings] = useState({ screenSharingEnabled: true, fileUploadsEnabled: true });
  const [canManageRoom, setCanManageRoom] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const localAudioStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioElementsRef = useRef(new Map());
  const fileInputRef = useRef(null);
  const localParticipantId = useRef(null);
  const localSpeakingRef = useRef(false);
  const cameraPromptedForSessionRef = useRef(false);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const mountedRef = useRef(false);
  const refreshFiles = useCallback(async () => {
    setFiles(await sessionService.files(id));
  }, [id]);
  const registerAudioElement = useCallback((key, element) => {
    if (element) audioElementsRef.current.set(key, element);
    else audioElementsRef.current.delete(key);
  }, []);
  const setParticipantSpeaking = useCallback((participantId, speaking) => {
    setSpeakingParticipantIds((current) => {
      if (current.has(participantId) === speaking) return current;
      const next = new Set(current);
      if (speaking) next.add(participantId);
      else next.delete(participantId);
      return next;
    });
  }, []);
  const handleAudioBlocked = useCallback((messageText) => {
    setAudioNeedsGesture(true);
    setMediaError(messageText);
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    socket?.emit('room:leave');
    socket?.disconnect();
    socketRef.current = null;
    for (const peer of peersRef.current.values()) peer.pc.close();
    peersRef.current.clear();
    for (const track of localAudioStreamRef.current?.getTracks() ?? []) track.stop();
    localAudioStreamRef.current = null;
    for (const track of cameraStreamRef.current?.getTracks() ?? []) track.stop();
    cameraStreamRef.current = null;
    const screenStream = screenStreamRef.current;
    screenStreamRef.current = null;
    for (const track of screenStream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let socket;

    async function openRoom() {
      setLoading(true);
      setError('');
      try {
        const [current, history, sharedFiles] = await Promise.all([
          sessionService.room(id),
          sessionService.messages(id),
          sessionService.files(id),
        ]);
        if (current.status === 'cancelled') throw new Error('This session has been cancelled.');
        if (cancelled) return;
        setSession(current);
        setMessages(history);
        setFiles(sharedFiles);
        setMediaConfigurationWarning(current.iceServersWarning ?? '');
        iceServersRef.current = current.iceServers?.length
          ? current.iceServers
          : [{ urls: 'stun:stun.l.google.com:19302' }];

        const token = tokenStorage.get();
        if (!token) throw new Error('Your session has ended. Please sign in again.');
        socket = connectToSessionRoom(token);
        socketRef.current = socket;

        const relay = (target, signal) => {
          socket.emit('rtc:signal', { target, ...signal }, (response) => {
            if (response?.error) setMediaError(response.error);
          });
        };

        const closePeer = (peerId) => {
          const peer = peersRef.current.get(peerId);
          if (peer) peer.pc.close();
          peersRef.current.delete(peerId);
          setRemoteMedia((currentMedia) => {
            const next = { ...currentMedia };
            delete next[peerId];
            return next;
          });
        };

        const createPeer = (peerId) => {
          const existing = peersRef.current.get(peerId);
          if (existing) return existing;
          if (typeof RTCPeerConnection !== 'function') {
            setMediaError('This browser does not support live audio and screen sharing.');
            return null;
          }
          const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
          const peer = {
            pc,
            makingOffer: false,
            ignoreOffer: false,
            settingRemoteAnswerPending: false,
            pendingCandidates: [],
            audioSender: null,
            cameraSender: null,
            screenSender: null,
            screenAudioSender: null,
          };
          peersRef.current.set(peerId, peer);
          const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
          const cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
          const screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
          const screenAudioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
          peer.audioSender = audioTransceiver.sender;
          peer.cameraSender = cameraTransceiver.sender;
          peer.screenSender = screenTransceiver.sender;
          peer.screenAudioSender = screenAudioTransceiver.sender;
          const remoteStreamKeys = new Map([
            [audioTransceiver, 'audioStream'],
            [cameraTransceiver, 'cameraStream'],
            [screenTransceiver, 'screenStream'],
            [screenAudioTransceiver, 'presentationAudioStream'],
          ]);
          const audioTrack = localAudioStreamRef.current?.getAudioTracks()[0];
          const cameraTrack = cameraStreamRef.current?.getVideoTracks()[0];
          const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
          const screenAudioTrack = screenStreamRef.current?.getAudioTracks()[0];
          if (audioTrack) {
            peer.audioSender.replaceTrack(audioTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect your microphone.'));
            });
          }
          if (cameraTrack) {
            peer.cameraSender.replaceTrack(cameraTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect your camera.'));
            });
          }
          if (screenTrack) {
            peer.screenSender.replaceTrack(screenTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect your screen share.'));
            });
          }
          if (screenAudioTrack) {
            peer.screenAudioSender.replaceTrack(screenAudioTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect the shared tab audio.'));
            });
          }

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) relay(peerId, { candidate: candidate.toJSON() });
          };
          pc.ontrack = ({ track, transceiver }) => {
            const key = remoteStreamKeys.get(transceiver);
            if (!key) return;
            const stream = new MediaStream([track]);
            const updateStream = (nextStream) => {
              setRemoteMedia((currentMedia) => ({
                ...currentMedia,
                [peerId]: { ...currentMedia[peerId], [key]: nextStream },
              }));
            };
            track.onunmute = () => updateStream(stream);
            track.onmute = () => updateStream(null);
            track.onended = () => updateStream(null);
            if (!track.muted) updateStream(stream);
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') {
              setMediaError('Media could not connect between participants. Check camera/microphone permissions and network access. A TURN relay is required when direct connections are blocked.');
            }
          };
          pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') pc.restartIce();
          };
          pc.onnegotiationneeded = async () => {
            try {
              peer.makingOffer = true;
              await pc.setLocalDescription();
              relay(peerId, { description: pc.localDescription.toJSON() });
            } catch (connectionError) {
              setMediaError(readableError(connectionError, 'Unable to establish a media connection.'));
            } finally {
              peer.makingOffer = false;
            }
          };
          return peer;
        };

        const handleSignal = async ({ from, description, candidate }) => {
          const peer = createPeer(from);
          if (!peer) return;
          const polite = socket.id > from;
          try {
            if (description) {
              const readyForOffer = !peer.makingOffer
                && (peer.pc.signalingState === 'stable' || peer.settingRemoteAnswerPending);
              const offerCollision = description.type === 'offer' && !readyForOffer;
              peer.ignoreOffer = !polite && offerCollision;
              if (peer.ignoreOffer) return;

              peer.settingRemoteAnswerPending = description.type === 'answer';
              await peer.pc.setRemoteDescription(description);
              peer.settingRemoteAnswerPending = false;
              for (const queuedCandidate of peer.pendingCandidates.splice(0)) {
                await peer.pc.addIceCandidate(queuedCandidate);
              }
              if (description.type === 'offer') {
                await peer.pc.setLocalDescription();
                relay(from, { description: peer.pc.localDescription.toJSON() });
              }
            }
            if (candidate && !peer.ignoreOffer) {
              if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
              else peer.pendingCandidates.push(candidate);
            }
          } catch (connectionError) {
            setMediaError(readableError(connectionError, 'A participant media connection failed.'));
          }
        };

        socket.on('connect', async () => {
          setConnected(true);
          setError('');
          setMediaError('');
          for (const peer of peersRef.current.values()) peer.pc.close();
          peersRef.current.clear();
          setRemoteMedia({});
          setMuted(true);
          setAudioNeedsGesture(false);
          for (const track of localAudioStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
          try {
            const result = await emitAck(socket, 'room:join', id);
            if (cancelled) return;
            localParticipantId.current = socket.id;
            setParticipants([
              {
                id: socket.id,
                userId: user.id,
                name: `${user.firstName} ${user.lastName}`,
                role: user.role,
                muted: true,
              },
              ...result.participants,
            ]);
            setScreenSharerId(result.screenSharerId);
            setRoomSettings(result.roomSettings ?? { screenSharingEnabled: true, fileUploadsEnabled: true });
            setCanManageRoom(Boolean(result.canManageRoom));
            for (const participant of result.participants) createPeer(participant.id);
          } catch (joinError) {
            setError(readableError(joinError, 'Unable to join this session.'));
            socket.disconnect();
          }
        });
        socket.on('disconnect', () => {
          setConnected(false);
          cameraPromptedForSessionRef.current = false;
          setMuted(true);
          setScreenSharerId(null);
          setParticipants([]);
          setRemoteMedia({});
          for (const track of localAudioStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
          const abandonedCamera = cameraStreamRef.current;
          cameraStreamRef.current = null;
          setCameraStream(null);
          for (const track of abandonedCamera?.getTracks() ?? []) {
            track.onended = null;
            track.stop();
          }
          const abandonedScreen = screenStreamRef.current;
          screenStreamRef.current = null;
          setScreenStream(null);
          for (const track of abandonedScreen?.getTracks() ?? []) {
            track.onended = null;
            track.stop();
          }
          for (const peer of peersRef.current.values()) peer.pc.close();
          peersRef.current.clear();
        });
        socket.on('connect_error', (connectionError) => {
          setConnected(false);
          setError(connectionError.message || 'Unable to connect to the session room.');
        });
        socket.on('room:participant-joined', (participant) => {
          setParticipants((current) => [...current.filter((item) => item.id !== participant.id), participant]);
          createPeer(participant.id);
        });
        socket.on('room:participant-updated', (participant) => {
          setParticipants((current) => current.map((item) => item.id === participant.id ? participant : item));
          if (participant.muted) setParticipantSpeaking(participant.id, false);
        });
        socket.on('room:participant-speaking', ({ participantId, speaking }) => {
          setParticipantSpeaking(participantId, speaking);
        });
        socket.on('room:participant-left', ({ participantId }) => {
          setParticipants((current) => current.filter((item) => item.id !== participantId));
          setParticipantSpeaking(participantId, false);
          setScreenSharerId((currentId) => currentId === participantId ? null : currentId);
          closePeer(participantId);
        });
        socket.on('room:screen-sharing', ({ participantId, sharing }) => {
          setScreenSharerId(sharing ? participantId : null);
        });
        socket.on('room:settings-updated', (updatedSettings) => {
          setRoomSettings(updatedSettings);
          if (!updatedSettings.screenSharingEnabled && screenStreamRef.current) {
            const stream = screenStreamRef.current;
            screenStreamRef.current = null;
            setScreenStream(null);
            for (const track of stream.getTracks()) {
              track.onended = null;
              track.stop();
            }
            Promise.all([...peersRef.current.values()].flatMap((peer) => [
              peer.screenSender.replaceTrack(null),
              peer.screenAudioSender.replaceTrack(null),
            ]))
              .catch((replaceError) => {
                setMediaError(readableError(replaceError, 'Unable to stop your screen share.'));
              });
          }
        });
        socket.on('room:files-changed', () => {
          refreshFiles().catch((refreshError) => {
            setError(readableError(refreshError, 'Unable to refresh shared files.'));
          });
        });
        socket.on('room:message', (newMessage) => {
          setMessages((current) => [...current, newMessage].slice(-100));
        });
        socket.on('rtc:signal', (signal) => {
          handleSignal(signal);
        });
        socket.connect();
      } catch (loadError) {
        if (!cancelled) setError(readableError(loadError, 'Unable to open the session room.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    openRoom();
    return () => {
      cancelled = true;
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      for (const peer of peersRef.current.values()) peer.pc.close();
      peersRef.current.clear();
      for (const track of localAudioStreamRef.current?.getTracks() ?? []) track.stop();
      localAudioStreamRef.current = null;
      for (const track of cameraStreamRef.current?.getTracks() ?? []) track.stop();
      cameraStreamRef.current = null;
      const screenStream = screenStreamRef.current;
      screenStreamRef.current = null;
      for (const track of screenStream?.getTracks() ?? []) {
        track.onended = null;
        track.stop();
      }
      mountedRef.current = false;
    };
  }, [id, refreshFiles, user.firstName, user.id, user.lastName, user.role]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  useEffect(() => {
    cameraPromptedForSessionRef.current = false;
  }, [id]);

  useEffect(() => {
    if (
      !connected
      || user.role !== 'student'
      || cameraPromptedForSessionRef.current
      || !participants.some((participant) => participant.id === localParticipantId.current)
    ) return;
    cameraPromptedForSessionRef.current = true;
    toggleCamera();
  }, [connected, participants, user.role]);

  useEffect(() => {
    if (!connected || muted) {
      localSpeakingRef.current = false;
      setMicLevel(0);
      return undefined;
    }
    const track = localAudioStreamRef.current?.getAudioTracks().find((item) => item.readyState === 'live');
    if (!track || typeof window.AudioContext !== 'function') return undefined;

    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let active = true;
    let interval;

    context.resume()
      .then(() => {
        if (!active) return;
        interval = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
          }
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 5);
          setMicLevel(level);
          const nextSpeaking = localSpeakingRef.current
            ? level >= 0.035
            : level >= 0.06;
          if (nextSpeaking !== localSpeakingRef.current) {
            localSpeakingRef.current = nextSpeaking;
            socketRef.current?.emit('room:speaking', nextSpeaking, (response) => {
              if (response?.error) {
                setMediaError(readableError(new Error(response.error), 'Unable to notify the room about microphone activity.'));
              }
            });
          }
        }, 100);
      })
      .catch((audioError) => {
        setMediaError(readableError(audioError, 'Unable to monitor microphone input level.'));
      });

    return () => {
      active = false;
      window.clearInterval(interval);
      source.disconnect();
      analyser.disconnect();
      if (context.state !== 'closed') {
        context.close().catch((audioError) => {
          setMediaError(readableError(audioError, 'Unable to close microphone level monitor.'));
        });
      }
      if (localSpeakingRef.current) {
        localSpeakingRef.current = false;
        socketRef.current?.emit('room:speaking', false);
      }
      setMicLevel(0);
    };
  }, [connected, muted]);

  useEffect(() => {
    const localId = localParticipantId.current;
    if (!localId) return;
    setParticipantSpeaking(localId, localSpeakingRef.current);
  }, [micLevel, setParticipantSpeaking]);

  const toggleMicrophone = async () => {
    if (!connected) return;
    if (muted && !navigator.mediaDevices?.getUserMedia) {
      setMediaError('Microphone access requires a supported browser on HTTPS or localhost.');
      return;
    }
    setMicrophoneBusy(true);
    try {
      if (muted) {
        let stream = localAudioStreamRef.current;
        if (!stream?.getAudioTracks().some((track) => track.readyState === 'live')) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (!mountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          localAudioStreamRef.current = stream;
        }
        const track = stream.getAudioTracks()[0];
        track.enabled = true;
        await Promise.all([...peersRef.current.values()].map((peer) => peer.audioSender.replaceTrack(track)));
        setMuted(false);
        const response = await emitAck(socketRef.current, 'room:microphone', false);
        if (response?.error) throw new Error(response.error);
      } else {
        for (const track of localAudioStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
        setMuted(true);
        const response = await emitAck(socketRef.current, 'room:microphone', true);
        if (response?.error) throw new Error(response.error);
      }
      setMediaError('');
    } catch (microphoneError) {
      setMuted(true);
      for (const track of localAudioStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
      setMediaError(
        microphoneError.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in your browser settings and try again.'
          : readableError(microphoneError, 'Unable to access your microphone.'),
      );
    } finally {
      setMicrophoneBusy(false);
    }
  };

  const toggleCamera = async () => {
    if (!connected || cameraBusy) return;
    if (cameraStreamRef.current) {
      const stream = cameraStreamRef.current;
      cameraStreamRef.current = null;
      setCameraStream(null);
      stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      try {
        await Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender.replaceTrack(null)));
        setMediaError('');
      } catch (cameraError) {
        setMediaError(readableError(cameraError, 'Unable to turn off your camera.'));
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('Camera access requires a supported browser over HTTPS or localhost.');
      return;
    }
    setCameraBusy(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      });
      if (!mountedRef.current || !socketRef.current?.connected) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      track.onended = () => {
        if (cameraStreamRef.current !== stream) return;
        cameraStreamRef.current = null;
        setCameraStream(null);
        Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender.replaceTrack(null)))
          .catch((replaceError) => {
            setMediaError(readableError(replaceError, 'Unable to stop your camera.'));
          });
      };

      await Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender.replaceTrack(track)));
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setMediaError('');
    } catch (cameraError) {
      stream?.getTracks().forEach((track) => track.stop());
      setMediaError(
        cameraError.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access in your browser settings and try again.'
          : cameraError.name === 'NotFoundError'
            ? 'No camera was found. Connect a camera and try again.'
          : readableError(cameraError, 'Unable to access your camera.'),
      );
    } finally {
      setCameraBusy(false);
    }
  };

  const toggleScreenShare = async () => {
    if (screenStreamRef.current) {
      const stream = screenStreamRef.current;
      screenStreamRef.current = null;
      setScreenStream(null);
      for (const track of stream.getTracks()) {
        track.onended = null;
        track.stop();
      }
      await Promise.all([...peersRef.current.values()].flatMap((peer) => [
        peer.screenSender.replaceTrack(null),
        peer.screenAudioSender.replaceTrack(null),
      ]));
      socketRef.current?.emit('room:screen-stop');
      return;
    }
    if (screenSharerId && screenSharerId !== localParticipantId.current) {
      setMediaError('Someone is already sharing their screen.');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported by this browser. Use a current browser over HTTPS or localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      try {
        await emitAck(socketRef.current, 'room:screen-start');
      } catch (shareError) {
        stream.getTracks().forEach((track) => track.stop());
        throw shareError;
      }
      screenStreamRef.current = stream;
      setScreenStream(stream);
      const track = stream.getVideoTracks()[0];
      track.onended = () => {
        if (screenStreamRef.current !== stream) return;
        screenStreamRef.current = null;
        setScreenStream(null);
        for (const audioTrack of stream.getAudioTracks()) audioTrack.onended = null;
        Promise.all([...peersRef.current.values()].flatMap((peer) => [
          peer.screenSender.replaceTrack(null),
          peer.screenAudioSender.replaceTrack(null),
        ]))
          .catch((replaceError) => {
            setMediaError(readableError(replaceError, 'Unable to stop your screen share.'));
          });
        socketRef.current?.emit('room:screen-stop');
      };
      const sharedAudioTrack = stream.getAudioTracks()[0];
      await Promise.all([...peersRef.current.values()].flatMap((peer) => [
        peer.screenSender.replaceTrack(track),
        peer.screenAudioSender.replaceTrack(sharedAudioTrack ?? null),
      ]));
      setMediaError(sharedAudioTrack
        ? ''
        : 'Screen is shared without audio. Choose a browser tab and enable Share tab audio in the browser prompt to share sound.');
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        setMediaError(
          shareError.name === 'NotAllowedError'
            ? 'Screen sharing was cancelled or denied by the browser.'
            : readableError(shareError, 'Unable to share your screen.'),
        );
      }
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = message.trim();
    if (!body || !connected || sending) return;
    setSending(true);
    try {
      const response = await emitAck(socketRef.current, 'room:message', { body });
      if (response?.error) throw new Error(response.error);
      setMessage('');
    } catch (sendError) {
      setError(readableError(sendError, 'Unable to send your message.'));
    } finally {
      setSending(false);
    }
  };

  const toggleRoomSetting = async (setting) => {
    if (!canManageRoom || updatingSettings) return;
    setUpdatingSettings(true);
    try {
      const response = await emitAck(socketRef.current, 'room:settings-update', {
        [setting]: !roomSettings[setting],
      });
      setRoomSettings(response.roomSettings);
      setError('');
    } catch (settingsError) {
      setError(readableError(settingsError, 'Unable to update room permissions.'));
    } finally {
      setUpdatingSettings(false);
    }
  };

  const uploadSelectedFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Files must be 8 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await sessionService.uploadFile(id, file);
      setFiles((currentFiles) => [uploaded, ...currentFiles.filter((item) => item.id !== uploaded.id)]);
      setError('');
      try {
        await emitAck(socketRef.current, 'room:files-changed');
      } catch {
        setError('The file was uploaded, but other participants may need to refresh their file list.');
      }
    } catch (uploadError) {
      setError(readableError(uploadError, 'Unable to upload this file.'));
    } finally {
      setUploading(false);
    }
  };

  const downloadSharedFile = async (item) => {
    try {
      const blob = await sessionService.downloadFile(id, item.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = item.name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(readableError(downloadError, 'Unable to download this file.'));
    }
  };

  const exitRoom = () => {
    leaveRoom();
    navigate(user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher/schedule' : '/student');
  };

  const enableRoomAudio = async () => {
    try {
      await Promise.all([...audioElementsRef.current.values()].map((element) => element.play()));
      setAudioNeedsGesture(false);
      setMediaError('');
    } catch (playError) {
      setAudioNeedsGesture(true);
      setMediaError(readableError(playError, 'Unable to play room audio.'));
    }
  };

  const sharer = participants.find((participant) => participant.id === screenSharerId);
  const sharedStream = screenSharerId === localParticipantId.current
    ? screenStream
    : remoteMedia[screenSharerId]?.screenStream;
  const galleryParticipants = participants
    .map((participant) => ({
      ...participant,
      stream: participant.id === localParticipantId.current
        ? cameraStream
        : remoteMedia[participant.id]?.cameraStream,
    }))
    .map((participant) => ({
      ...participant,
      isSpeaking: speakingParticipantIds.has(participant.id),
    }));
  const cameraParticipants = galleryParticipants.filter((participant) => participant.stream);
  const speakingParticipants = participants.filter((participant) => speakingParticipantIds.has(participant.id));
  const gridColumns = Math.min(
    Math.max(1, galleryParticipants.length),
    Math.max(1, Math.ceil(Math.sqrt(galleryParticipants.length * (16 / 9)))),
  );
  const gridRows = Math.ceil(galleryParticipants.length / gridColumns);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (error && !session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={exitRoom}><ArrowLeft className="size-4" /> Back to sessions</Button>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-800 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <UsersRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{session?.title}</h1>
            <p className="truncate text-xs text-slate-400">{session?.classroom?.name} · {formatTime(session?.startsAt)}–{formatTime(session?.endsAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-2 text-xs ${connected ? 'text-emerald-300' : 'text-amber-300'}`}>
            <span className={`size-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {connected ? 'Room connected' : 'Connecting'}
          </span>
          {speakingParticipants.length > 0 && (
            <span
              className="flex max-w-48 items-center gap-1.5 truncate rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200"
              role="status"
              aria-live="polite"
            >
              <Volume2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {speakingParticipants.length === 1
                  ? `${speakingParticipants[0].name} is speaking`
                  : `${speakingParticipants.length} people speaking`}
              </span>
            </span>
          )}
          <Button variant="ghost" className="!px-3 !py-2 text-slate-300" onClick={exitRoom} aria-label="Leave class room">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {mediaConfigurationWarning && (
        <div className="px-3 pt-3">
          <Alert tone="info">{mediaConfigurationWarning}</Alert>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <section className="relative flex min-h-56 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {screenSharerId ? (
            <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
              <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                {sharedStream ? (
                  <VideoStage stream={sharedStream} label={sharer?.name ?? 'A participant'} />
                ) : (
                  <div className="px-6 text-center">
                    <MonitorUp className="mx-auto size-10 text-indigo-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-white">
                      {sharer?.name ?? 'The presenter'} is sharing their screen
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Connecting to the presentation…</p>
                  </div>
                )}
              </div>
              {cameraParticipants.length > 0 && (
                <div
                  className="flex w-28 shrink-0 flex-col gap-2 overflow-y-auto sm:w-40 lg:w-48"
                  aria-label="Participant cameras"
                >
                  {cameraParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className={`relative aspect-video min-h-20 shrink-0 overflow-hidden rounded-lg border bg-slate-900 ${participant.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-slate-700'}`}
                    >
                      <VideoStage
                        stream={participant.stream}
                        label={`${participant.name}${participant.id === localParticipantId.current ? ' (You)' : ''}`}
                        kind="camera"
                      />
                      {participant.isSpeaking && (
                        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-1 text-[10px] font-semibold text-white">
                          <Volume2 className="size-3" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : galleryParticipants.length > 0 ? (
            <div
              className="grid min-h-0 w-full flex-1 gap-2 overflow-y-auto p-2 sm:gap-3 sm:p-3"
              style={{
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridRows}, minmax(8rem, 1fr))`,
              }}
              aria-label="Classroom participants"
            >
              {galleryParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className={`relative min-h-0 min-w-0 overflow-hidden rounded-lg border bg-slate-900 ${participant.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-slate-800'}`}
                >
                  {participant.stream ? (
                    <VideoStage
                      stream={participant.stream}
                      label={`${participant.name}${participant.id === localParticipantId.current ? ' (You)' : ''}`}
                      kind="camera"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                      <span className="flex size-12 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-100">
                        {initials(participant.name)}
                      </span>
                      <span className="max-w-full truncate px-2 text-xs font-medium text-slate-100">
                        {participant.name}{participant.id === localParticipantId.current ? ' (You)' : ''}
                      </span>
                      <span className="text-xs">Camera off</span>
                    </div>
                  )}
                  {participant.isSpeaking && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-1 text-xs font-semibold text-white">
                      <Volume2 className="size-3.5" aria-hidden="true" /> Speaking
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="mx-auto max-w-md px-6 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-slate-800 text-indigo-300">
                <MonitorUp className="size-8" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">Your class room is ready</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {roomSettings.screenSharingEnabled
                  ? 'Turn on your camera or microphone, or share your screen to present to the class.'
                  : 'Turn on your camera or microphone to speak with the class. Screen sharing is disabled by the teacher.'}
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Live audio and video require browser permissions. Some school networks need a configured TURN relay; chat will still work if media cannot connect.
              </p>
              {session?.classroom?.openAccess && (
                <p className="mt-2 text-xs font-medium text-amber-300">Open classroom · up to 20 participants</p>
              )}
              <p className="mt-5 text-xs text-slate-500">
                {session?.classroom?.name} · {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
              </p>
            </div>
          )}
        </section>

        <aside className="flex h-72 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 md:h-auto md:w-80">
          <div className="flex border-b border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'chat' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <MessageSquare className="size-4" aria-hidden="true" /> Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-sm font-medium ${activeTab === 'files' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <File className="size-4" aria-hidden="true" /> Files
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('people')}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'people' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
            >
              <UsersRound className="size-4" aria-hidden="true" /> People ({participants.length})
            </button>
          </div>

          {activeTab === 'chat' ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">Messages in this room will appear here.</div>
                ) : messages.map((item) => item.type === 'system' ? (
                  <p key={item.id} className="text-center text-xs text-slate-500">
                    <span>{item.body}</span>
                    <time className="ml-2">{formatTime(item.createdAt)}</time>
                  </p>
                ) : (
                  <article key={item.id} className="flex gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-slate-200">
                      {initials(item.sender.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-semibold text-slate-200">{item.sender.name}</span>
                        <time className="text-[10px] text-slate-500">{formatTime(item.createdAt)}</time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{item.body}</p>
                    </div>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-slate-800 p-3">
                <label className="sr-only" htmlFor="room-message">Message the class</label>
                <textarea
                  id="room-message"
                  rows={1}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form.requestSubmit();
                    }
                  }}
                  placeholder="Message everyone"
                  disabled={!connected}
                  className="max-h-24 min-h-10 flex-1 resize-y rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!connected || !message.trim() || sending}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>
            </>
          ) : activeTab === 'files' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              {canManageRoom && (
                <section className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teacher controls</h2>
                  <button
                    type="button"
                    aria-pressed={roomSettings.screenSharingEnabled}
                    disabled={!connected || updatingSettings}
                    onClick={() => toggleRoomSetting('screenSharingEnabled')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                  >
                    Screen sharing
                    <span className={roomSettings.screenSharingEnabled ? 'text-emerald-300' : 'text-amber-300'}>
                      {roomSettings.screenSharingEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={roomSettings.fileUploadsEnabled}
                    disabled={!connected || updatingSettings}
                    onClick={() => toggleRoomSetting('fileUploadsEnabled')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                  >
                    File uploads
                    <span className={roomSettings.fileUploadsEnabled ? 'text-emerald-300' : 'text-amber-300'}>
                      {roomSettings.fileUploadsEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>
                </section>
              )}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Shared files</h2>
                  <p className="mt-1 text-xs text-slate-500">Files are removed when this session ends · 8 MB max</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={uploadSelectedFile}
                  aria-label="Choose a file to share"
                />
                <Button
                  variant="secondary"
                  className="!px-3 !py-2"
                  disabled={!connected || !roomSettings.fileUploadsEnabled || uploading}
                  isLoading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  <span>{uploading ? 'Uploading' : 'Upload'}</span>
                </Button>
              </div>
              {!roomSettings.fileUploadsEnabled && (
                <p className="rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-200">File uploads are disabled by the teacher.</p>
              )}
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-live="polite">
                {files.length === 0 ? (
                  <li className="py-6 text-center text-sm text-slate-500">No files have been shared in this session.</li>
                ) : files.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-800 p-2.5">
                    <File className="size-4 shrink-0 text-indigo-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{item.name}</span>
                      <span className="block text-xs text-slate-500">
                        {formatFileSize(item.size)}{item.uploader?.name ? ` · ${item.uploader.name}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadSharedFile(item)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-white"
                      aria-label={`Download ${item.name}`}
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">In this session</p>
              <ul className="space-y-1">
                {participants.map((participant) => (
                  <li key={participant.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-800">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-200">
                      {initials(participant.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-200">
                        {participant.name}{participant.id === localParticipantId.current ? ' (You)' : ''}
                      </span>
                      <span className="block text-xs capitalize text-slate-500">{participant.role}</span>
                      {speakingParticipantIds.has(participant.id) && (
                        <span className="mt-0.5 block text-xs font-medium text-emerald-300">Speaking</span>
                      )}
                    </span>
                    {speakingParticipantIds.has(participant.id)
                      ? <Volume2 className="size-4 text-emerald-300" aria-label="Speaking" />
                      : participant.muted
                        ? <MicOff className="size-4 text-slate-500" aria-label="Muted" />
                        : <Mic className="size-4 text-emerald-400" aria-label="Microphone on" />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>

      {(error || mediaError) && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Alert tone="error">{error || mediaError}</Alert>
            {audioNeedsGesture && (
              <Button variant="secondary" onClick={enableRoomAudio}>
                Enable room audio
              </Button>
            )}
          </div>
        </div>
      )}

      <footer className="flex min-h-20 items-center justify-center gap-3 border-t border-slate-800 bg-slate-950 px-4">
        <Button
          variant={muted ? 'secondary' : 'primary'}
          className={muted ? '!border-slate-700 !bg-slate-800 !text-white hover:!bg-slate-700' : ''}
          disabled={!connected || microphoneBusy}
          isLoading={microphoneBusy}
          onClick={toggleMicrophone}
          aria-pressed={!muted}
        >
          {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          <span className="hidden sm:inline">{muted ? 'Unmute' : 'Mute'}</span>
        </Button>
        {!muted && (
          <div
            className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3"
            role="status"
            aria-label={micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Microphone is on, no sound detected'}
            title={micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Microphone is on — speak to test'}
          >
            <span className="hidden text-xs text-slate-300 sm:inline">
              {micLevel >= 0.06 ? 'Mic active' : 'Mic on'}
            </span>
            <span className="sr-only">
              {micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Speak to test your microphone'}
            </span>
            <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
              {[0.12, 0.25, 0.4, 0.58, 0.78].map((threshold, index) => (
                <span
                  key={threshold}
                  className={`w-1 rounded-full transition-colors ${micLevel >= threshold ? 'bg-emerald-400' : 'bg-slate-600'}`}
                  style={{ height: `${6 + index * 3}px` }}
                />
              ))}
            </span>
          </div>
        )}
        <Button
          variant={cameraStream ? 'primary' : 'secondary'}
          className={!cameraStream ? '!border-slate-700 !bg-slate-800 !text-white hover:!bg-slate-700' : ''}
          disabled={!connected || cameraBusy}
          isLoading={cameraBusy}
          onClick={toggleCamera}
          aria-pressed={Boolean(cameraStream)}
        >
          {cameraStream ? <Video className="size-4" /> : <VideoOff className="size-4" />}
          <span className="hidden sm:inline">{cameraStream ? 'Turn camera off' : 'Turn camera on'}</span>
        </Button>
        <Button
          variant={screenStream ? 'primary' : 'secondary'}
          className={!screenStream ? '!border-slate-700 !bg-slate-800 !text-white hover:!bg-slate-700' : ''}
          disabled={!connected || !roomSettings.screenSharingEnabled || Boolean(screenSharerId && screenSharerId !== localParticipantId.current)}
          onClick={toggleScreenShare}
          aria-pressed={Boolean(screenStream)}
        >
          {screenStream ? <ScreenShareOff className="size-4" /> : <MonitorUp className="size-4" />}
          <span className="hidden sm:inline">{screenStream ? 'Stop sharing' : 'Share screen'}</span>
        </Button>
        <Button variant="danger" onClick={exitRoom} aria-label="Leave class room">
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </footer>

      {Object.entries(remoteMedia).map(([participantId, media]) => {
        const participant = participants.find((item) => item.id === participantId);
        return (
          <Fragment key={participantId}>
            {!participant?.muted && media.audioStream && (
              <AudioOutput
                elementKey={`${participantId}:microphone`}
                stream={media.audioStream}
                onBlocked={handleAudioBlocked}
                registerElement={registerAudioElement}
              />
            )}
            {media.presentationAudioStream && (
              <AudioOutput
                elementKey={`${participantId}:presentation`}
                stream={media.presentationAudioStream}
                onBlocked={handleAudioBlocked}
                registerElement={registerAudioElement}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
