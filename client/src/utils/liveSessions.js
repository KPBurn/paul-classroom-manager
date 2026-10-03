/**
 * Applies a live session event to a list of sessions already on the page, so
 * the page changes without asking the API again. Returns the same list when
 * the event does not concern it.
 *
 * `accept` decides whether a session that has just started belongs in the list.
 */
export function applySessionEvent(sessions, type, payload, accept = () => true) {
  if (type === 'started') {
    const session = {
      ...payload.session,
      // The server says it has started; a browser clock that runs behind must not show it as still to come.
      startsAt: new Date(Math.min(new Date(payload.session.startsAt).getTime(), payload.receivedAt ?? Date.now())).toISOString(),
    };
    const existing = sessions.find((item) => item.id === session.id);
    if (!existing && !accept(session)) return sessions;
    return existing
      // Keep what is the reader's own, such as their attendance.
      ? sessions.map((item) => (item === existing ? { ...existing, ...session, attendance: existing.attendance } : item))
      : [...sessions, session];
  }
  if (type === 'ended' || type === 'reopened') {
    if (!sessions.some((item) => item.id === payload.sessionId)) return sessions;
    return sessions.map((item) => (item.id === payload.sessionId ? { ...item, endedAt: payload.endedAt ?? null } : item));
  }
  return sessions;
}

const people = (count) => `${count} ${count === 1 ? 'person' : 'people'}`;

function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One line about who is in a session's room, for people who have not joined it. */
export function describePresence(presence) {
  if (!presence?.count) return 'No one is in the room yet';
  const teachers = (presence.teachers ?? []).map((teacher) => teacher.name);
  if (!teachers.length) return `${people(presence.count)} in the room · waiting for the teacher`;
  const teacherPart = `${listNames(teachers)} ${teachers.length === 1 ? 'is' : 'are'} in the room`;
  const others = presence.count - teachers.length;
  return others > 0 ? `${teacherPart} with ${people(others)}` : teacherPart;
}

/** The names staff are given, shortened to fit a line: "Ana Cruz, Ben Lim +3". */
export function presenceNames(presence, limit = 3) {
  const names = (presence?.participants ?? []).map((participant) => participant.name);
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} +${names.length - limit}`;
}
