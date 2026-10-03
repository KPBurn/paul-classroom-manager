/**
 * What the server tells connected pages about sessions, outside the live room
 * itself. Everything here goes from the server to the browser; the only thing
 * a browser sends is `sessions:watch`, which carries no data.
 *
 * Each classroom has two audiences: everyone who may see it, and its staff
 * (its teachers, and administrators). Students are not shown their classmates
 * on the classroom page, so only staff are told who is in a room by name.
 *
 * @typedef {{ id: string, name: string }} Person
 * @typedef {{ userId: string, name: string, role: string }} RoomPerson
 *
 * `session:started` — a teacher started a class now.
 * @typedef {{ session: object, by: Person }} SessionStarted  `session` is a list item, as `GET /sessions` gives it.
 *
 * `session:ended`, `session:reopened` — a teacher ended the class for everyone, or opened it again.
 * @typedef {{ sessionId: string, classroomId: string, endedAt: (string|null), by: Person }} SessionEnded
 *
 * `session:schedule-changed` — sessions of a classroom were scheduled, edited or cancelled.
 * @typedef {{ classroomId: string }} ScheduleChanged
 *
 * `session:presence` — who is in a session's room, sent whenever someone enters or leaves.
 * It is the whole state, not a difference, so a missed event is put right by the next one.
 * @typedef {{
 *   sessionId: string, classroomId: string, count: number, teachers: Person[],
 *   change?: { type: 'joined'|'left', role: string, name?: string, userId?: string },
 *   participants?: RoomPerson[],
 * }} SessionPresence  `participants` and the name in `change` are for staff only.
 */
import { socketServer } from './connections.js';

export const SESSION_EVENTS = {
  started: 'session:started',
  ended: 'session:ended',
  reopened: 'session:reopened',
  scheduleChanged: 'session:schedule-changed',
  presence: 'session:presence',
};

/** Administrators follow every classroom. */
export const ALL_CLASSROOMS_ROOM = 'classrooms:all';
export const classroomRoom = (classroomId) => `classroom:${classroomId}`;
export const classroomStaffRoom = (classroomId) => `classroom:${classroomId}:staff`;

/**
 * Sends an event to the people following a classroom. With `staffPayload`,
 * staff get that instead of `payload`.
 */
export function publishToClassroom(classroomId, event, payload, staffPayload) {
  const io = socketServer();
  if (!io) return;
  const everyone = classroomRoom(String(classroomId));
  const staff = [classroomStaffRoom(String(classroomId)), ALL_CLASSROOMS_ROOM];
  if (staffPayload === undefined) {
    io.to([everyone, ALL_CLASSROOMS_ROOM]).emit(event, payload);
    return;
  }
  io.to(everyone).except(staff).emit(event, payload);
  io.to(staff).emit(event, staffPayload);
}
