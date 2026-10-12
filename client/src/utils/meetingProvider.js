/** The meetings a class can be held in, as the server names them. */
export const MEETING_PROVIDER_LABELS = { builtin: 'Class room', zoom: 'Zoom' };

/**
 * Where a session is held, as its teacher chose. Anything but 'zoom' is the
 * class room, the same rule as the server's (authz/policies.js).
 */
export const meetingProviderOf = (session) => (session?.meetingProvider === 'zoom' ? 'zoom' : 'builtin');

/** A session moved to `meetingProvider`. Moving back to the class room deletes its Zoom meeting. */
export const withMeetingProvider = (session, meetingProvider) => ({
  ...session,
  meetingProvider,
  ...(meetingProvider !== 'zoom' && { zoomMeeting: false }),
});

/**
 * What a session's lobby offers. Students get only the meeting the teacher
 * chose; the people who run the class also get the choice.
 *
 * - `offersRoom`: whether to offer the class room's Join button.
 * - `zoomState`: null for a class held in the class room, otherwise 'host'
 *   (the teacher opens the meeting), 'join', 'waiting' (the teacher has not
 *   opened it yet) or 'unavailable' (Zoom is switched off for the school).
 * - `canChoose`: whether to show the class room / Zoom choice, and
 *   `zoomChoosable` whether Zoom can be picked in it.
 */
export function lobbyMeeting(session, { canManageRoom = false } = {}) {
  const provider = meetingProviderOf(session);
  const zoomEnabled = Boolean(session?.zoom?.enabled);
  let zoomState = null;
  if (provider === 'zoom') {
    if (!zoomEnabled) zoomState = 'unavailable';
    else if (canManageRoom) zoomState = 'host';
    else zoomState = session.zoomMeeting ? 'join' : 'waiting';
  }
  return {
    provider,
    offersRoom: provider === 'builtin',
    zoomState,
    // There is a choice to make, or a class in Zoom to move back to its room.
    canChoose: Boolean(canManageRoom) && (zoomEnabled || provider === 'zoom'),
    zoomChoosable: zoomEnabled,
  };
}
