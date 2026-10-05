/**
 * Tells connected pages that a list they may be showing has changed, so they
 * load it again without a refresh. Only the name of what changed is sent,
 * never the data: each page asks the API again and gets what its account may see.
 *
 * `data:changed` — `{ resource }`, one of DATA_RESOURCES.
 */
import { socketServer } from './connections.js';

export const DATA_CHANGED_EVENT = 'data:changed';
export const DATA_RESOURCES = {
  announcements: 'announcements',
  classrooms: 'classrooms',
  enrollment: 'enrollment',
  feedback: 'feedback',
  materials: 'materials',
  users: 'users',
};

/** Every connection joins these when it signs in. */
export const userRoom = (userId) => `user:${userId}`;
export const roleRoom = (role) => `role:${role}`;

/**
 * Without options everyone signed in is told. `roles` and `userIds` narrow it
 * to those accounts, for lists that only they can see.
 */
export function publishDataChanged(resource, { roles, userIds } = {}) {
  const io = socketServer();
  if (!io) return;
  const rooms = [
    ...(roles ?? []).map(roleRoom),
    ...(userIds ?? []).filter(Boolean).map((id) => userRoom(String(id))),
  ];
  if (roles || userIds) {
    if (rooms.length) io.to(rooms).emit(DATA_CHANGED_EVENT, { resource });
  } else {
    io.emit(DATA_CHANGED_EVENT, { resource });
  }
}
