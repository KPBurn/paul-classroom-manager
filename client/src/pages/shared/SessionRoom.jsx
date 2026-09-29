import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  ScreenShareOff,
  Send,
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

function VideoStage({ stream, label }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label={`Screen shared by ${label}`}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
      <p className="absolute bottom-4 left-4 rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">
        {label} is sharing their screen
      </p>
    </div>
  );
}

function AudioOutput({ stream, onBlocked }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((error) => {
        onBlocked(error.name === 'NotAllowedError'
          ? 'Your browser is blocking audio playback. Click in the room to allow sound.'
          : 'Unable to play participant audio.');
      });
    }
  }, [onBlocked, stream]);

  return <audio ref={audioRef} autoPlay />;
}

export default function SessionRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [remoteMedia, setRemoteMedia] = useState({});
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(true);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [screenSharerId, setScreenSharerId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const localAudioStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const localParticipantId = useRef(null);
  const mountedRef = useRef(false);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    socket?.emit('room:leave');
    socket?.disconnect();
    socketRef.current = null;
    for (const peer of peersRef.current.values()) peer.pc.close();
    peersRef.current.clear();
    for (const track of localAudioStreamRef.current?.getTracks() ?? []) track.stop();
    localAudioStreamRef.current = null;
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
        const [current, history] = await Promise.all([
          sessionService.room(id),
          sessionService.messages(id),
        ]);
        if (current.status === 'cancelled') throw new Error('This session has been cancelled.');
        if (cancelled) return;
        setSession(current);
        setMessages(history);

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
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          const peer = {
            pc,
            makingOffer: false,
            ignoreOffer: false,
            settingRemoteAnswerPending: false,
            audioSender: null,
            videoSender: null,
          };
          peersRef.current.set(peerId, peer);
          const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
          const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
          peer.audioSender = audioTransceiver.sender;
          peer.videoSender = videoTransceiver.sender;
          const audioTrack = localAudioStreamRef.current?.getAudioTracks()[0];
          const videoTrack = screenStreamRef.current?.getVideoTracks()[0];
          if (audioTrack) {
            peer.audioSender.replaceTrack(audioTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect your microphone.'));
            });
          }
          if (videoTrack) {
            peer.videoSender.replaceTrack(videoTrack).catch((replaceError) => {
              setMediaError(readableError(replaceError, 'Unable to connect your screen share.'));
            });
          }

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) relay(peerId, { candidate: candidate.toJSON() });
          };
          pc.ontrack = ({ track }) => {
            const key = track.kind === 'audio' ? 'audioStream' : 'screenStream';
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
              setMediaError('A participant could not connect directly. Check network or firewall settings.');
            }
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
              if (description.type === 'offer') {
                await peer.pc.setLocalDescription();
                relay(from, { description: peer.pc.localDescription.toJSON() });
              }
            }
            if (candidate && !peer.ignoreOffer) await peer.pc.addIceCandidate(candidate);
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
        });
        socket.on('room:participant-left', ({ participantId }) => {
          setParticipants((current) => current.filter((item) => item.id !== participantId));
          setScreenSharerId((currentId) => currentId === participantId ? null : currentId);
          closePeer(participantId);
        });
        socket.on('room:screen-sharing', ({ participantId, sharing }) => {
          setScreenSharerId(sharing ? participantId : null);
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
      const screenStream = screenStreamRef.current;
      screenStreamRef.current = null;
      for (const track of screenStream?.getTracks() ?? []) {
        track.onended = null;
        track.stop();
      }
      mountedRef.current = false;
    };
  }, [id, user.firstName, user.id, user.lastName, user.role]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

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

  const toggleScreenShare = async () => {
    if (screenStreamRef.current) {
      const stream = screenStreamRef.current;
      screenStreamRef.current = null;
      setScreenStream(null);
      for (const track of stream.getTracks()) track.stop();
      await Promise.all([...peersRef.current.values()].map((peer) => peer.videoSender.replaceTrack(null)));
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
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
        Promise.all([...peersRef.current.values()].map((peer) => peer.videoSender.replaceTrack(null)))
          .catch((replaceError) => {
            setMediaError(readableError(replaceError, 'Unable to stop your screen share.'));
          });
        socketRef.current?.emit('room:screen-stop');
      };
      await Promise.all([...peersRef.current.values()].map((peer) => peer.videoSender.replaceTrack(track)));
      setMediaError('');
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

  const exitRoom = () => {
    leaveRoom();
    navigate(user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher/schedule' : '/student');
  };

  const sharer = participants.find((participant) => participant.id === screenSharerId);
  const sharedStream = screenSharerId === localParticipantId.current
    ? screenStream
    : remoteMedia[screenSharerId]?.screenStream;

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
          <Button variant="ghost" className="!px-3 !py-2 text-slate-300" onClick={exitRoom} aria-label="Leave class room">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <section className="relative flex min-h-56 flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          {sharedStream ? (
            <VideoStage stream={sharedStream} label={sharer?.name ?? 'A participant'} />
          ) : (
            <div className="mx-auto max-w-md px-6 text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-slate-800 text-indigo-300">
                <MonitorUp className="size-8" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">Your class room is ready</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Share your screen to present to the class. Participants can turn on their microphone to speak.
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Voice and screen sharing connect directly between browsers. Some school networks may block media; chat will still work.
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
                ) : messages.map((item) => (
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
                    </span>
                    {participant.muted
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
          <Alert tone="error">{error || mediaError}</Alert>
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
        <Button
          variant={screenStream ? 'primary' : 'secondary'}
          className={!screenStream ? '!border-slate-700 !bg-slate-800 !text-white hover:!bg-slate-700' : ''}
          disabled={!connected || Boolean(screenSharerId && screenSharerId !== localParticipantId.current)}
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
        {connected && <span className="hidden text-xs text-slate-500 lg:inline">Camera off</span>}
      </footer>

      {Object.entries(remoteMedia).map(([participantId, media]) => {
        const participant = participants.find((item) => item.id === participantId);
        return !participant?.muted && media.audioStream
          ? <AudioOutput key={participantId} stream={media.audioStream} onBlocked={setMediaError} />
          : null;
      })}
    </div>
  );
}
