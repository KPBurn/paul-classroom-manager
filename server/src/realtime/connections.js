/**
 * Lets the rest of the server end someone's live-room connections. A socket is
 * only checked when it connects, so without this a person who is deactivated,
 * has their password reset or changes role would stay in a class until their
 * token expired.
 */
let io = null;

/** Called once by the session socket setup. Until then (for example in API-only tests) nothing is connected. */
export function registerSocketServer(server) {
  io = server;
}

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
