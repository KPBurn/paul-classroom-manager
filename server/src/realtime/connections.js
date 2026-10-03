/**
 * Lets the rest of the server end someone's live-room connections. A socket is
 * only checked when it connects, so without this a person who is deactivated,
 * has their password reset or changes role would stay in a class until their
 * token expired.
 */
let io = null;
let roomHooks = {};

/**
 * Called once by the session socket setup. Until then (for example in API-only tests) nothing is connected.
 * `hooks` are what the live rooms let the rest of the server ask of them.
 */
export function registerSocketServer(server, hooks = {}) {
  io = server;
  roomHooks = hooks;
}

export const socketServer = () => io;

/** A session's start time changed: people already waiting in its room may now be in class. */
export const sessionTimingChanged = (sessionId) => roomHooks.sessionTimingChanged?.(String(sessionId));

/** A classroom's people changed: connected accounts follow it, or stop following it, straight away. */
export const classroomPeopleChanged = (classroom) => roomHooks.classroomPeopleChanged?.(classroom);

async function signOut(socket, message) {
  // Leave the room first, so attendance is closed and the others see them go.
  await socket.data.leaveRoom?.().catch((error) => {
    console.error('Unable to record a participant leaving a session room', error);
  });
  socket.emit('room:signed-out', { message });
  socket.disconnect(true);
}

async function signOutWhere(matches, message) {
  if (!io) return;
  await Promise.all([...io.sockets.sockets.values()].filter(matches).map((socket) => signOut(socket, message)));
}

export const disconnectUser = (userId, message) => signOutWhere(
  (socket) => String(socket.data.user?._id) === String(userId),
  message,
);

export const disconnectRoleTestSessions = (message) => signOutWhere(
  (socket) => Boolean(socket.data.roleTestSession),
  message,
);
