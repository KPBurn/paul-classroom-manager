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
  X,
  CircleStop,
  LogOut,
  Undo2,
  UserX,
  UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { sessionService } from '../../services/session.service.js';
import { connectToSessionRoom } from '../../services/sessionRoom.service.js';
import { tokenStorage } from '../../utils/tokenStorage.js';
import { getErrorMessage } from '../../utils/errors.js';

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
// Each peer connection carries these media sections in this fixed order.
const MEDIA_SECTIONS = [
  { kind: 'audio', streamKey: 'audioStream' },
  { kind: 'video', streamKey: 'cameraStream' },
  { kind: 'video', streamKey: 'screenStream' },
  { kind: 'audio', streamKey: 'presentationAudioStream' },
];
// Microphone level (0–1) at which someone counts as speaking, and how long a pause is ignored.
const SPEAKING_START_LEVEL = 0.06;
const SPEAKING_STOP_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 700;
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

// Camera video is mirrored for every viewer, so others see you as you see yourself.
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
        className={kind === 'camera' ? 'h-full w-full -scale-x-100 object-cover' : 'max-h-full max-w-full rounded-lg object-contain'}
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

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
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
  const isPhone = useMediaQuery('(max-width: 639px)');
  // The side panel starts open where it sits beside the stage, and hidden on small screens.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [lastSeenMessageId, setLastSeenMessageId] = useState(null);
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
  const [classEnded, setClassEnded] = useState(false);
  const [removedParticipants, setRemovedParticipants] = useState([]);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [leaveChoiceOpen, setLeaveChoiceOpen] = useState(false);
  const [moderating, setModerating] = useState(false);
  // Shown instead of the room after a teacher removes you or ends the class.
  const [exitNotice, setExitNotice] = useState(null);
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
        setLastSeenMessageId(history.at(-1)?.id ?? null);
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

        const attachTransceivers = (peer, transceivers) => {
          [peer.audioSender, peer.cameraSender, peer.screenSender, peer.screenAudioSender] = transceivers
            .map((transceiver) => transceiver.sender);
          const localTracks = [
            [peer.audioSender, localAudioStreamRef.current?.getAudioTracks()[0], 'Unable to connect your microphone.'],
            [peer.cameraSender, cameraStreamRef.current?.getVideoTracks()[0], 'Unable to connect your camera.'],
            [peer.screenSender, screenStreamRef.current?.getVideoTracks()[0], 'Unable to connect your screen share.'],
            [peer.screenAudioSender, screenStreamRef.current?.getAudioTracks()[0], 'Unable to connect the shared tab audio.'],
          ];
          for (const [sender, track, failureMessage] of localTracks) {
            if (!track) continue;
            sender.replaceTrack(track).catch((replaceError) => {
              setMediaError(readableError(replaceError, failureMessage));
            });
          }
        };

        const createPeer = (peerId) => {
          const existing = peersRef.current.get(peerId);
          if (existing) return existing;
          if (typeof RTCPeerConnection !== 'function') {
            setMediaError('This browser does not support live audio and screen sharing.');
            return null;
          }
          const hasTurnServer = iceServersRef.current.some(({ urls }) =>
            (Array.isArray(urls) ? urls : [urls]).some((url) => /^(turn|turns):/i.test(url)));
          const pc = new RTCPeerConnection({
            iceServers: iceServersRef.current,
            iceTransportPolicy: hasTurnServer ? 'relay' : 'all',
          });
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
          // Only one side creates the media sections. Browsers do not reuse transceivers made with
          // addTransceiver for a remote offer, so if both sides created them, each side's media
          // would arrive on unexpected transceivers and be dropped. The other side adopts the
          // offered transceivers in handleSignal.
          if (socket.id < peerId) {
            attachTransceivers(peer, MEDIA_SECTIONS.map(({ kind }) => pc.addTransceiver(kind, { direction: 'sendrecv' })));
          }

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) relay(peerId, { candidate: candidate.toJSON() });
          };
          pc.ontrack = ({ track, transceiver }) => {
            const key = MEDIA_SECTIONS[pc.getTransceivers().indexOf(transceiver)]?.streamKey;
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
                if (!peer.audioSender) {
                  const transceivers = peer.pc.getTransceivers();
                  for (const transceiver of transceivers) transceiver.direction = 'sendrecv';
                  attachTransceivers(peer, transceivers);
                }
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
            // Whoever is already talking, so it shows straight away instead of at their next pause.
            setSpeakingParticipantIds(new Set(
              result.participants.filter((participant) => participant.speaking).map((participant) => participant.id),
            ));
            setScreenSharerId(result.screenSharerId);
            setRoomSettings(result.roomSettings ?? { screenSharingEnabled: true, fileUploadsEnabled: true });
            setCanManageRoom(Boolean(result.canManageRoom));
            setClassEnded(Boolean(result.classEnded));
            setRemovedParticipants(result.removedParticipants ?? []);
            for (const participant of result.participants) createPeer(participant.id);
          } catch (joinError) {
            setError(readableError(joinError, 'Unable to join this session.'));
            socket.disconnect();
          }
        });
        socket.on('disconnect', () => {
          setConnected(false);
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
              peer.screenSender?.replaceTrack(null),
              peer.screenAudioSender?.replaceTrack(null),
            ]))
              .catch((replaceError) => {
                setMediaError(readableError(replaceError, 'Unable to stop your screen share.'));
              });
          }
        });
        socket.on('room:force-muted', ({ by } = {}) => {
          for (const track of localAudioStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
          setMuted(true);
          toast(`${by ?? 'The teacher'} muted your microphone.`, { icon: '🔇' });
        });
        socket.on('room:removed', ({ by } = {}) => {
          setExitNotice({
            title: 'You were removed from the class',
            message: `${by ?? 'The teacher'} removed you from this session. Ask your teacher if you think this was a mistake.`,
          });
          leaveRoom();
        });
        // The account was deactivated, changed role or had its password reset while in the room.
        socket.on('room:signed-out', ({ message: reason } = {}) => {
          setExitNotice({
            title: 'You were signed out of the class',
            message: reason ?? 'Your account changed. Sign in again to continue.',
          });
          leaveRoom();
        });
        socket.on('room:ended', ({ by } = {}) => {
          const endedByYou = by === `${user.firstName} ${user.lastName}`;
          setExitNotice({
            title: 'The class has ended',
            message: endedByYou
              ? 'You ended the class for everyone. Students cannot rejoin unless you reopen it from the room.'
              : `${by ?? 'The teacher'} ended the class for everyone.`,
          });
          leaveRoom();
        });
        socket.on('room:removed-updated', (removed) => {
          setRemovedParticipants(Array.isArray(removed) ? removed : []);
        });
        socket.on('room:reopened', () => {
          setClassEnded(false);
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
  }, [messages, activeTab, panelOpen]);

  const chatVisible = panelOpen && activeTab === 'chat';
  useEffect(() => {
    if (chatVisible) setLastSeenMessageId(messages.at(-1)?.id ?? null);
  }, [chatVisible, messages]);

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
    let lastLoudAt = 0;

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
          // Starting needs a clearly raised level; once speaking, short pauses between words
          // do not count as stopping, so the room is not told "stopped, started" several times a second.
          const now = Date.now();
          if (level >= SPEAKING_STOP_LEVEL) lastLoudAt = now;
          const nextSpeaking = localSpeakingRef.current
            ? now - lastLoudAt < SPEAKING_HOLD_MS
            : level >= SPEAKING_START_LEVEL;
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
        await Promise.all([...peersRef.current.values()].map((peer) => peer.audioSender?.replaceTrack(track)));
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
        await Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender?.replaceTrack(null)));
        await emitAck(socketRef.current, 'room:camera', false);
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
        Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender?.replaceTrack(null)))
          .then(() => emitAck(socketRef.current, 'room:camera', false))
          .catch((replaceError) => {
            setMediaError(readableError(replaceError, 'Unable to stop your camera or update your camera status.'));
          });
      };

      await Promise.all([...peersRef.current.values()].map((peer) => peer.cameraSender?.replaceTrack(track)));
      await emitAck(socketRef.current, 'room:camera', true);
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setMediaError('');
    } catch (cameraError) {
      const cleanupResults = await Promise.allSettled(
        [...peersRef.current.values()].map((peer) => peer.cameraSender?.replaceTrack(null)),
      );
      stream?.getTracks().forEach((track) => track.stop());
      try {
        if (socketRef.current?.connected) await emitAck(socketRef.current, 'room:camera', false);
      } catch (statusError) {
        setMediaError(readableError(statusError, 'Unable to update your camera status.'));
        return;
      }
      const cleanupFailure = cleanupResults.find((result) => result.status === 'rejected');
      if (cleanupFailure) {
        setMediaError(readableError(cleanupFailure.reason, 'Unable to stop the camera after a media setup failure.'));
        return;
      }
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
        peer.screenSender?.replaceTrack(null),
        peer.screenAudioSender?.replaceTrack(null),
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
          peer.screenSender?.replaceTrack(null),
          peer.screenAudioSender?.replaceTrack(null),
        ]))
          .catch((replaceError) => {
            setMediaError(readableError(replaceError, 'Unable to stop your screen share.'));
          });
        socketRef.current?.emit('room:screen-stop');
      };
      const sharedAudioTrack = stream.getAudioTracks()[0];
      await Promise.all([...peersRef.current.values()].flatMap((peer) => [
        peer.screenSender?.replaceTrack(track),
        peer.screenAudioSender?.replaceTrack(sharedAudioTrack ?? null),
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
    navigate(user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/student');
  };
  // Teachers of this lesson can go straight from the room to its feedback list.
  const feedbackPath = user.role === 'teacher' && session?.canManageRoom && session.classroom?.id
    ? `/teacher/feedback?class=${session.classroom.id}&lesson=${id}`
    : null;
  const leaveToFeedback = () => {
    leaveRoom();
    navigate(feedbackPath);
  };
  // Teachers choose between leaving and ending the class for everyone.
  const requestLeave = () => {
    if (canManageRoom) setLeaveChoiceOpen(true);
    else exitRoom();
  };

  /** Sends a teacher moderation request; returns the server reply, or null after showing the error. */
  const moderate = async (failureMessage, event, ...args) => {
    setModerating(true);
    try {
      return await emitAck(socketRef.current, event, ...args);
    } catch (moderationError) {
      toast.error(readableError(moderationError, failureMessage));
      return null;
    } finally {
      setModerating(false);
    }
  };
  const muteParticipant = async (participant) => {
    if (await moderate('Unable to mute that participant.', 'room:mute-participant', participant.id)) {
      toast.success(`${participant.name} was muted.`);
    }
  };
  const muteEveryone = async () => {
    if (await moderate('Unable to mute the class.', 'room:mute-all')) toast.success('Students were muted.');
  };
  const removeParticipant = async () => {
    const participant = pendingRemoval;
    const response = await moderate('Unable to remove that participant.', 'room:remove-participant', participant.id);
    setPendingRemoval(null);
    if (response) {
      setRemovedParticipants(response.removedParticipants ?? []);
      toast.success(`${participant.name} was removed from the class.`);
    }
  };
  const readmitParticipant = async (person) => {
    const response = await moderate('Unable to allow them back.', 'room:readmit-participant', person.userId);
    if (response) {
      setRemovedParticipants(response.removedParticipants ?? []);
      toast.success(`${person.name} can join again.`);
    }
  };
  const endClassForEveryone = async () => {
    setLeaveChoiceOpen(false);
    await moderate('Unable to end the class.', 'room:end');
  };
  const reopenClass = async () => {
    if (await moderate('Unable to reopen the class.', 'room:reopen')) {
      setClassEnded(false);
      toast.success('The class is open to students again.');
    }
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
      // A remote camera track is not reliably muted when the sender turns it off, so it would
      // keep showing its last frame; rely on the camera state the participant reports instead.
      stream: participant.id === localParticipantId.current
        ? cameraStream
        : (participant.cameraEnabled ? remoteMedia[participant.id]?.cameraStream : null),
    }))
    .map((participant) => ({
      ...participant,
      isSpeaking: speakingParticipantIds.has(participant.id),
    }));
  const cameraParticipants = galleryParticipants.filter((participant) =>
    participant.stream || participant.cameraEnabled);
  const speakingParticipants = participants.filter((participant) => speakingParticipantIds.has(participant.id));
  const gridColumns = Math.min(
    Math.max(1, galleryParticipants.length),
    isPhone ? 2 : Math.max(1, Math.ceil(Math.sqrt(galleryParticipants.length * (16 / 9)))),
  );
  const unreadMessages = chatVisible
    ? 0
    : messages
      .slice(messages.findIndex((item) => item.id === lastSeenMessageId) + 1)
      .filter((item) => item.type !== 'system' && item.sender?.id !== user.id)
      .length;
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
  if (exitNotice) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-6 text-ink-100">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-ink-800 text-ink-300">
            <LogOut className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-xl font-semibold">{exitNotice.title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-400">{exitNotice.message}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            {feedbackPath && (
              <Button variant="inverse" onClick={() => leaveToFeedback()}>
                <MessageSquare className="size-4" aria-hidden="true" /> Write feedback
              </Button>
            )}
            <Button
              variant={feedbackPath ? 'dark' : 'inverse'}
              onClick={exitRoom}
            >
              <ArrowLeft className="size-4" /> Back to dashboard
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-950 text-ink-100">
      <header className="flex min-h-16 items-center justify-between border-b border-ink-800 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-ink-300">
            <UsersRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{session?.title}</h1>
            <p className="truncate text-xs text-ink-400">{session?.classroom?.name} · {formatTime(session?.startsAt)}–{formatTime(session?.endsAt)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span
            className={`flex items-center gap-2 text-xs ${connected ? 'text-emerald-300' : 'text-amber-300'}`}
            title={connected ? 'Room connected' : 'Connecting'}
          >
            <span className={`size-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="hidden sm:inline">{connected ? 'Room connected' : 'Connecting'}</span>
            <span className="sr-only sm:hidden">{connected ? 'Room connected' : 'Connecting'}</span>
          </span>
          {speakingParticipants.length > 0 && (
            <span
              className="hidden max-w-48 items-center gap-1.5 truncate rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 sm:flex"
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
          <Button variant="dark" size="sm" onClick={requestLeave} aria-label="Leave class room">
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

      {canManageRoom && classEnded && (
        <div className="px-3 pt-3">
          <div className="flex flex-col gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <p>You ended this class earlier. Students cannot join until you reopen it.</p>
            <Button variant="inverse" size="sm" className="shrink-0" onClick={reopenClass} disabled={moderating}>Reopen class</Button>
          </div>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <section className="relative flex min-h-56 min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-800 bg-ink-950">
          {screenSharerId ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 sm:flex-row">
              <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                {sharedStream ? (
                  <VideoStage stream={sharedStream} label={sharer?.name ?? 'A participant'} />
                ) : (
                  <div className="px-6 text-center">
                    <MonitorUp className="mx-auto size-10 text-ink-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-white">
                      {sharer?.name ?? 'The presenter'} is sharing their screen
                    </p>
                    <p className="mt-1 text-xs text-ink-400">Connecting to the presentation…</p>
                  </div>
                )}
              </div>
              {cameraParticipants.length > 0 && (
                <div
                  className="flex h-20 shrink-0 gap-2 overflow-x-auto sm:h-auto sm:w-40 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto lg:w-48"
                  aria-label="Participant cameras"
                >
                  {cameraParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className={`relative aspect-video h-full shrink-0 overflow-hidden rounded-lg border bg-ink-900 sm:h-auto sm:min-h-20 ${participant.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-ink-700'}`}
                    >
                      {participant.stream ? (
                        <VideoStage
                          stream={participant.stream}
                          label={`${participant.name}${participant.id === localParticipantId.current ? ' (You)' : ''}`}
                          kind="camera"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400 sm:gap-2">
                          <span className="flex size-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-ink-100 sm:size-10 sm:text-sm">
                            {initials(participant.name)}
                          </span>
                          <span className="max-w-full truncate px-2 text-center text-xs font-medium text-ink-100">
                            {participant.name}{participant.id === localParticipantId.current ? ' (You)' : ''}
                          </span>
                          <span className="hidden text-[10px] text-amber-300 sm:inline">Camera on · waiting for video</span>
                        </div>
                      )}
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
                  className={`relative min-h-0 min-w-0 overflow-hidden rounded-lg border bg-ink-900 ${participant.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/70' : 'border-ink-800'}`}
                >
                  {participant.stream ? (
                    <VideoStage
                      stream={participant.stream}
                      label={`${participant.name}${participant.id === localParticipantId.current ? ' (You)' : ''}`}
                      kind="camera"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-400">
                      <span className="flex size-12 items-center justify-center rounded-full bg-ink-700 text-sm font-semibold text-ink-100">
                        {initials(participant.name)}
                      </span>
                      <span className="max-w-full truncate px-2 text-xs font-medium text-ink-100">
                        {participant.name}{participant.id === localParticipantId.current ? ' (You)' : ''}
                      </span>
                      <span className={`text-xs ${participant.cameraEnabled ? 'text-amber-300' : ''}`}>
                        {participant.cameraEnabled ? 'Camera on · waiting for video' : 'Camera off'}
                      </span>
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
              <span className="mx-auto flex size-16 items-center justify-center rounded-xl bg-ink-800 text-ink-300">
                <MonitorUp className="size-8" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">Your class room is ready</h2>
              <p className="mt-2 text-sm leading-6 text-ink-400">
                {roomSettings.screenSharingEnabled
                  ? 'Turn on your camera or microphone, or share your screen to present to the class.'
                  : 'Turn on your camera or microphone to speak with the class. Screen sharing is disabled by the teacher.'}
              </p>
              <p className="mt-3 text-xs leading-5 text-ink-500">
                Live audio and video require browser permissions. Some school networks need a configured TURN relay; chat will still work if media cannot connect.
              </p>
              {session?.classroom?.openAccess && (
                <p className="mt-2 text-xs font-medium text-amber-300">Open classroom · up to 20 participants</p>
              )}
              <p className="mt-5 text-xs text-ink-500">
                {session?.classroom?.name} · {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
              </p>
            </div>
          )}
        </section>

        {panelOpen && (
          <aside
            id="room-side-panel"
            className="flex h-[45dvh] min-h-64 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-900 md:h-auto md:min-h-0 md:w-80"
          >
            <div className="flex border-b border-ink-800">
              {[
                { tab: 'chat', icon: MessageSquare, label: 'Chat' },
                { tab: 'files', icon: File, label: 'Files' },
                { tab: 'people', icon: UsersRound, label: `People (${participants.length})` },
              ].map(({ tab, icon: Icon, label }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium ${activeTab === tab ? 'border-white text-white' : 'border-transparent text-ink-400 hover:text-white'}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" /> {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="flex w-11 shrink-0 items-center justify-center border-b-2 border-transparent text-ink-400 hover:text-white"
                aria-label="Hide chat panel"
                title="Hide chat panel"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
  
            {activeTab === 'chat' ? (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
                  {messages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-ink-500">Messages in this room will appear here.</div>
                  ) : messages.map((item) => item.type === 'system' ? (
                    <p key={item.id} className="text-center text-xs text-ink-500">
                      <span>{item.body}</span>
                      <time className="ml-2">{formatTime(item.createdAt)}</time>
                    </p>
                  ) : (
                    <article key={item.id} className="flex gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-ink-200">
                        {initials(item.sender.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-xs font-semibold text-ink-200">{item.sender.name}</span>
                          <time className="text-[10px] text-ink-500">{formatTime(item.createdAt)}</time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink-300">{item.body}</p>
                      </div>
                    </article>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-ink-800 p-3">
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
                    className="max-h-24 min-h-10 flex-1 resize-y rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none placeholder:text-ink-500 focus:border-ink-400 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!connected || !message.trim() || sending}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-ink-900 hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Send message"
                  >
                    {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </form>
              </>
            ) : activeTab === 'files' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                {canManageRoom && (
                  <section className="space-y-2 rounded-lg border border-ink-700 bg-ink-800/60 p-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Teacher controls</h2>
                    <button
                      type="button"
                      aria-pressed={roomSettings.screenSharingEnabled}
                      disabled={!connected || updatingSettings}
                      onClick={() => toggleRoomSetting('screenSharingEnabled')}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-ink-200 hover:bg-ink-700 disabled:opacity-60"
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
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-ink-200 hover:bg-ink-700 disabled:opacity-60"
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
                    <h2 className="text-sm font-semibold text-ink-200">Shared files</h2>
                    <p className="mt-1 text-xs text-ink-500">Files are removed when this session ends · 8 MB max</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={uploadSelectedFile}
                    aria-label="Choose a file to share"
                  />
                  <Button
                    variant="dark"
                    size="sm"
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
                    <li className="py-6 text-center text-sm text-ink-500">No files have been shared in this session.</li>
                  ) : files.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg bg-ink-800 p-2.5">
                      <File className="size-4 shrink-0 text-ink-300" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-200">{item.name}</span>
                        <span className="block text-xs text-ink-500">
                          {formatFileSize(item.size)}{item.uploader?.name ? ` · ${item.uploader.name}` : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadSharedFile(item)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-300 hover:bg-ink-700 hover:text-white"
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
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">In this session</p>
                  {canManageRoom && participants.some((participant) => !participant.moderator && !participant.muted
                    && participant.id !== localParticipantId.current) && (
                    <button
                      type="button"
                      onClick={muteEveryone}
                      disabled={moderating}
                      className="flex items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-xs font-medium text-ink-200 hover:bg-ink-800 disabled:opacity-50"
                    >
                      <MicOff className="size-3.5" aria-hidden="true" /> Mute all
                    </button>
                  )}
                </div>
                <ul className="space-y-1">
                  {participants.map((participant) => {
                    const canModerate = canManageRoom && !participant.moderator
                      && participant.id !== localParticipantId.current;
                    return (
                    <li key={participant.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-ink-800">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-medium text-ink-100">
                        {initials(participant.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-200">
                          {participant.name}{participant.id === localParticipantId.current ? ' (You)' : ''}
                        </span>
                        <span className="block text-xs capitalize text-ink-500">{participant.role}</span>
                        {speakingParticipantIds.has(participant.id) && (
                          <span className="mt-0.5 block text-xs font-medium text-emerald-300">Speaking</span>
                        )}
                      </span>
                      {speakingParticipantIds.has(participant.id)
                        ? <Volume2 className="size-4 text-emerald-300" aria-label="Speaking" />
                        : participant.muted
                          ? <MicOff className="size-4 text-ink-500" aria-label="Muted" />
                          : <Mic className="size-4 text-emerald-400" aria-label="Microphone on" />}
                      {canModerate && (
                        <span className="flex shrink-0 items-center gap-0.5">
                          {!participant.muted && (
                            <button
                              type="button"
                              onClick={() => muteParticipant(participant)}
                              disabled={moderating}
                              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-700 hover:text-white disabled:opacity-50"
                              aria-label={`Mute ${participant.name}`}
                              title="Mute"
                            >
                              <MicOff className="size-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingRemoval(participant)}
                            disabled={moderating}
                            className="rounded-md p-1.5 text-ink-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                            aria-label={`Remove ${participant.name} from the class`}
                            title="Remove from class"
                          >
                            <UserX className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </li>
                    );
                  })}
                </ul>
                {canManageRoom && removedParticipants.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Removed from class</p>
                    <ul className="space-y-1">
                      {removedParticipants.map((person) => (
                        <li key={person.userId} className="flex items-center gap-3 rounded-lg px-2 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-400">{person.name}</span>
                          <button
                            type="button"
                            onClick={() => readmitParticipant(person)}
                            disabled={moderating}
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-300 hover:bg-ink-800 disabled:opacity-50"
                          >
                            <Undo2 className="size-3.5" aria-hidden="true" /> Allow back
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </main>

      {(error || mediaError) && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Alert tone="error">{error || mediaError}</Alert>
            {audioNeedsGesture && (
              <Button variant="inverse" onClick={enableRoomAudio}>
                Enable room audio
              </Button>
            )}
          </div>
        </div>
      )}

      <footer className="flex min-h-16 items-center justify-center gap-2 border-t border-ink-800 bg-ink-950 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:min-h-20 sm:gap-3 sm:px-4">
        <Button
          variant={muted ? 'dark' : 'inverse'}
          className="max-sm:px-3"
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
            className="flex h-10 items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3"
            role="status"
            aria-label={micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Microphone is on, no sound detected'}
            title={micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Microphone is on — speak to test'}
          >
            <span className="hidden text-xs text-ink-300 sm:inline">
              {micLevel >= 0.06 ? 'Mic active' : 'Mic on'}
            </span>
            <span className="sr-only">
              {micLevel >= 0.06 ? 'Microphone is picking up sound' : 'Speak to test your microphone'}
            </span>
            <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
              {[0.12, 0.25, 0.4, 0.58, 0.78].map((threshold, index) => (
                <span
                  key={threshold}
                  className={`w-1 rounded-full transition-colors ${micLevel >= threshold ? 'bg-emerald-400' : 'bg-ink-600'}`}
                  style={{ height: `${6 + index * 3}px` }}
                />
              ))}
            </span>
          </div>
        )}
        <Button
          variant={cameraStream ? 'inverse' : 'dark'}
          className="max-sm:px-3"
          disabled={!connected || cameraBusy}
          isLoading={cameraBusy}
          onClick={toggleCamera}
          aria-pressed={Boolean(cameraStream)}
        >
          {cameraStream ? <Video className="size-4" /> : <VideoOff className="size-4" />}
          <span className="hidden sm:inline">{cameraStream ? 'Turn camera off' : 'Turn camera on'}</span>
        </Button>
        <Button
          variant={screenStream ? 'inverse' : 'dark'}
          className="max-sm:px-3"
          disabled={!connected || !roomSettings.screenSharingEnabled || Boolean(screenSharerId && screenSharerId !== localParticipantId.current)}
          onClick={toggleScreenShare}
          aria-pressed={Boolean(screenStream)}
        >
          {screenStream ? <ScreenShareOff className="size-4" /> : <MonitorUp className="size-4" />}
          <span className="hidden sm:inline">{screenStream ? 'Stop sharing' : 'Share screen'}</span>
        </Button>
        <Button
          variant={panelOpen ? 'inverse' : 'dark'}
          className="relative max-sm:px-3"
          onClick={() => setPanelOpen((open) => !open)}
          aria-pressed={panelOpen}
          aria-controls="room-side-panel"
          aria-label={panelOpen ? 'Hide chat' : unreadMessages ? `Show chat, ${unreadMessages} unread` : 'Show chat'}
        >
          <MessageSquare className="size-4" />
          <span className="hidden sm:inline">{panelOpen ? 'Hide chat' : 'Show chat'}</span>
          {unreadMessages > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unreadMessages > 99 ? '99+' : unreadMessages}
            </span>
          )}
        </Button>
        <Button variant="danger" className="max-sm:px-3" onClick={requestLeave} aria-label="Leave class room">
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </footer>

      <Modal
        open={leaveChoiceOpen}
        onClose={() => setLeaveChoiceOpen(false)}
        title="Leave the class?"
        description="You can leave and let the class continue, or end it for everyone."
        size="max-w-md"
      >
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={exitRoom} className="justify-start">
            <LogOut className="size-4" aria-hidden="true" /> Leave the class
          </Button>
          {feedbackPath && (
            <Button variant="secondary" onClick={leaveToFeedback} className="justify-start">
              <MessageSquare className="size-4" aria-hidden="true" /> Leave and write feedback
            </Button>
          )}
          <Button variant="danger" onClick={endClassForEveryone} isLoading={moderating} className="justify-start">
            <CircleStop className="size-4" aria-hidden="true" /> End class for everyone
          </Button>
          <p className="mt-1 text-xs text-ink-500">
            Ending removes everyone from the room. Students cannot rejoin until a teacher reopens the class.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove from the class?"
        message={
          pendingRemoval && (
            <p>
              <span className="font-medium text-ink-900">{pendingRemoval.name}</span> will be removed from this
              session and cannot rejoin unless you allow them back from the People tab.
            </p>
          )
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        isLoading={moderating}
        onConfirm={removeParticipant}
        onCancel={() => setPendingRemoval(null)}
      />

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
