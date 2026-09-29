import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/environment.js';
import { User } from '../models/User.js';
import * as sessionService from '../services/session.service.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';
import { sessionMessageSchema } from '../validators/session.validators.js';

const roomName = (sessionId) => `session:${sessionId}`;
const MAX_ROOM_PARTICIPANTS = 12;
const MAX_OPEN_ROOM_PARTICIPANTS = 20;
const CHAT_RATE_WINDOW_MS = 10_000;
const MAX_CHAT_MESSAGES_PER_WINDOW = 10;
const signalSchema = z.object({
  target: z.string().min(1).max(100),
  description: z.object({
    type: z.enum(['offer', 'answer']),
    sdp: z.string().max(100_000),
  }).strict().optional(),
  candidate: z.object({
    candidate: z.string().max(5_000),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }).strict().nullable().optional(),
}).strict().refine((signal) => Boolean(signal.description) || signal.candidate !== undefined);
const roomSettingsSchema = z.object({
  screenSharingEnabled: z.boolean().optional(),
  fileUploadsEnabled: z.boolean().optional(),
}).strict().refine((settings) => Object.keys(settings).length > 0);

function participantResult(socket) {
  const { user, muted = true } = socket.data;
  return {
    id: socket.id,
    userId: String(user._id),
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    muted,
  };
}

function roomState(rooms, sessionId) {
  let state = rooms.get(sessionId);
  if (!state) {
    state = {
      participants: new Map(),
      screenSharerId: null,
      screenSharingEnabled: true,
      fileUploadsEnabled: true,
    };
    rooms.set(sessionId, state);
  }
  return state;
}

function replyWithError(ack, error, fallback) {
  if (error instanceof AppError) {
    ack?.({ error: error.message });
    return;
  }
  if (error instanceof Error && error.name === 'ZodError') {
    ack?.({ error: error.issues?.[0]?.message ?? 'Invalid request' });
    return;
  }
  console.error(fallback, error);
  ack?.({ error: fallback });
}

export function attachSessionSocket(httpServer) {
  const rooms = new Map();
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrls, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 100_000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('Authentication required'));
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      next(new Error('Your session is invalid or has expired. Please sign in again.'));
      return;
    }

    let user;
    try {
      user = mongoose.isValidObjectId(payload.sub) ? await User.findById(payload.sub) : null;
    } catch (error) {
      console.error('Unable to authenticate a session room connection', error);
      next(new Error('Unable to verify your account. Please try again.'));
      return;
    }
    if (!user || user.status !== 'active' || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      next(new Error('Your account is not active. Please sign in again.'));
      return;
    }
    if (!['admin', 'teacher', 'student'].includes(user.role)) {
      next(new Error('Your account cannot join class rooms.'));
      return;
    }

    socket.data.user = user;
    socket.data.tokenExpiresAt = payload.exp ? payload.exp * 1000 : null;
    next();
  });

  io.on('connection', (socket) => {
    if (socket.data.tokenExpiresAt) {
      const expiryDelay = socket.data.tokenExpiresAt - Date.now();
      if (expiryDelay <= 0) {
        socket.disconnect(true);
        return;
      }
      socket.data.expiryTimer = setTimeout(() => socket.disconnect(true), Math.min(expiryDelay, 2_147_000_000));
      socket.data.expiryTimer.unref();
    }

    async function leaveRoom() {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      const room = roomName(sessionId);
      let activity = null;
      let leaveError = null;
      if (state) {
        const participant = state.participants.get(socket.id);
        state.participants.delete(socket.id);
        if (state.screenSharerId === socket.id) {
          state.screenSharerId = null;
          io.to(room).emit('room:screen-sharing', { participantId: socket.id, sharing: false });
        }
        const userStillPresent = participant && [...state.participants.values()]
          .some((item) => item.userId === participant.userId);
        if (participant && !userStillPresent) {
          try {
            await sessionService.recordRoomLeave(sessionId, socket.data.user);
            if (socket.data.sessionOpenAccess) {
              activity = await sessionService.createRoomActivity(sessionId, socket.data.user, 'left');
            }
          } catch (error) {
            leaveError = error;
          }
        }
        if (state.participants.size === 0) rooms.delete(sessionId);
      }
      socket.data.sessionId = null;
      socket.data.sessionOpenAccess = false;
      socket.leave(room);
      socket.to(room).emit('room:participant-left', { participantId: socket.id });
      if (activity) io.to(room).emit('room:message', activity);
      if (leaveError) throw leaveError;
    }

    socket.on('room:join', async (sessionId, ack) => {
      try {
        if (typeof sessionId !== 'string' || !mongoose.isValidObjectId(sessionId)) {
          throw new AppError(400, 'Invalid session');
        }
        const session = await sessionService.getSessionForParticipant(sessionId, socket.data.user);
        if (session.status === 'cancelled') throw new AppError(400, 'This session has been cancelled');
        if (socket.data.sessionId === sessionId) {
          const state = roomState(rooms, sessionId);
          ack?.({
            participants: [...state.participants.values()],
            screenSharerId: state.screenSharerId,
            roomSettings: {
              screenSharingEnabled: session.screenSharingEnabled ?? true,
              fileUploadsEnabled: session.fileUploadsEnabled ?? true,
            },
            canManageRoom: sessionService.canManageSession(session, socket.data.user),
          });
          return;
        }

        await leaveRoom();
        const room = roomName(sessionId);
        const state = roomState(rooms, sessionId);
        state.screenSharingEnabled = session.screenSharingEnabled ?? true;
        state.fileUploadsEnabled = session.fileUploadsEnabled ?? true;
        const participantLimit = session.classroom.openAccess
          ? MAX_OPEN_ROOM_PARTICIPANTS
          : MAX_ROOM_PARTICIPANTS;
        if (state.participants.size >= participantLimit) {
          throw new AppError(400, `This session room supports up to ${participantLimit} participants`);
        }
        const existingParticipants = [...state.participants.values()];
        const participant = participantResult(socket);
        const alreadyPresent = existingParticipants.some((item) => item.userId === participant.userId);
        let activity = null;
        if (!alreadyPresent) {
          await sessionService.recordRoomJoin(sessionId, socket.data.user);
          if (session.classroom.openAccess) {
            activity = await sessionService.createRoomActivity(sessionId, socket.data.user, 'joined');
          }
        }
        socket.data.sessionId = sessionId;
        socket.data.sessionOpenAccess = session.classroom.openAccess;
        socket.data.muted = true;
        socket.join(room);
        state.participants.set(socket.id, participant);
        socket.to(room).emit('room:participant-joined', participant);
        if (activity) io.to(room).emit('room:message', activity);
        ack?.({
          session: {
            id: String(session._id),
            title: session.title,
            classroom: session.classroom.name,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
          },
          participants: existingParticipants,
          screenSharerId: state.screenSharerId,
          roomSettings: {
            screenSharingEnabled: state.screenSharingEnabled,
            fileUploadsEnabled: state.fileUploadsEnabled,
          },
          canManageRoom: sessionService.canManageSession(session, socket.data.user),
        });
      } catch (error) {
        replyWithError(ack, error, 'Unable to join this session');
      }
    });

    socket.on('room:leave', async (ack) => {
      try {
        await leaveRoom();
        ack?.({ success: true });
      } catch (error) {
        replyWithError(ack, error, 'Unable to record your room departure');
      }
    });

    socket.on('room:message', async (input, ack) => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId) throw new AppError(400, 'Join the session before sending a message');
        const { body } = sessionMessageSchema.parse(input);
        const recentMessages = (socket.data.recentMessages ?? [])
          .filter((sentAt) => Date.now() - sentAt < CHAT_RATE_WINDOW_MS);
        if (recentMessages.length >= MAX_CHAT_MESSAGES_PER_WINDOW) {
          throw new AppError(429, 'You are sending messages too quickly');
        }
        recentMessages.push(Date.now());
        socket.data.recentMessages = recentMessages;
        const message = await sessionService.createSessionMessage(sessionId, body, socket.data.user);
        io.to(roomName(sessionId)).emit('room:message', message);
        ack?.({ message });
      } catch (error) {
        replyWithError(ack, error, 'Unable to send your message');
      }
    });

    socket.on('room:microphone', (muted, ack) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || typeof muted !== 'boolean') {
        ack?.({ error: 'Join the session before changing microphone status' });
        return;
      }
      socket.data.muted = muted;
      const participant = participantResult(socket);
      rooms.get(sessionId)?.participants.set(socket.id, participant);
      io.to(roomName(sessionId)).emit('room:participant-updated', participant);
      ack?.({ success: true });
    });

    socket.on('room:screen-start', (ack) => {
      const sessionId = socket.data.sessionId;
      const state = sessionId ? rooms.get(sessionId) : null;
      if (!state) {
        ack?.({ error: 'Join the session before sharing your screen' });
        return;
      }
      if (!state.screenSharingEnabled) {
        ack?.({ error: 'Screen sharing is disabled by the teacher' });
        return;
      }
      if (state.screenSharerId && state.screenSharerId !== socket.id) {
        ack?.({ error: 'Someone is already sharing their screen' });
        return;
      }
      state.screenSharerId = socket.id;
      io.to(roomName(sessionId)).emit('room:screen-sharing', { participantId: socket.id, sharing: true });
      ack?.({ success: true });
    });

    socket.on('room:screen-stop', (ack) => {
      const sessionId = socket.data.sessionId;
      const state = sessionId ? rooms.get(sessionId) : null;
      if (state?.screenSharerId === socket.id) {
        state.screenSharerId = null;
        io.to(roomName(sessionId)).emit('room:screen-sharing', { participantId: socket.id, sharing: false });
      }
      ack?.({ success: true });
    });

    socket.on('room:settings-update', async (input, ack) => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId) throw new AppError(400, 'Join the session before changing room permissions');
        const settings = roomSettingsSchema.parse(input);
        if (!rooms.has(sessionId)) throw new AppError(400, 'Join the session before changing room permissions');
        const updated = await sessionService.updateRoomSettings(sessionId, settings, socket.data.user);
        const state = rooms.get(sessionId);
        if (state) {
          Object.assign(state, updated);
          if (!state.screenSharingEnabled && state.screenSharerId) {
            const participantId = state.screenSharerId;
            state.screenSharerId = null;
            io.to(roomName(sessionId)).emit('room:screen-sharing', { participantId, sharing: false });
          }
          io.to(roomName(sessionId)).emit('room:settings-updated', updated);
        }
        ack?.({ success: true, roomSettings: updated });
      } catch (error) {
        replyWithError(ack, error, 'Unable to update room permissions');
      }
    });

    socket.on('room:files-changed', (ack) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !rooms.has(sessionId)) {
        ack?.({ error: 'Join the session before refreshing shared files' });
        return;
      }
      socket.to(roomName(sessionId)).emit('room:files-changed');
      ack?.({ success: true });
    });

    socket.on('rtc:signal', (input, ack) => {
      const sessionId = socket.data.sessionId;
      const state = sessionId ? rooms.get(sessionId) : null;
      const parsed = signalSchema.safeParse(input);
      if (!state || !parsed.success || !state.participants.has(parsed.data.target)) {
        ack?.({ error: parsed.success ? 'That participant is not in this session' : 'Invalid connection signal' });
        return;
      }
      const { target, description, candidate } = parsed.data;
      io.to(target).emit('rtc:signal', { from: socket.id, description, candidate });
      ack?.({ success: true });
    });

    socket.on('disconnect', () => {
      if (socket.data.expiryTimer) clearTimeout(socket.data.expiryTimer);
      leaveRoom().catch((error) => {
        console.error('Unable to record a participant leaving a session room', error);
      });
    });
  });

  return io;
}
