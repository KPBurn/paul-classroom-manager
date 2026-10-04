/**
 * How the feeds are arranged while a class is being presented: a row along the
 * bottom of the shared screen, not a column beside it, so the presentation
 * keeps the whole width of a wide screen and nothing covers the content.
 */

/** Row heights for the two tile sizes: [phone, wider screens]. */
export const FEED_ROW_HEIGHTS = { small: 'h-16 sm:h-20', large: 'h-24 sm:h-28' };

/**
 * Who appears in the row, and in what order: the students first (they are what
 * the presenter is watching), then teachers and moderators, then the viewer
 * themselves. Each group keeps the room's own join order.
 *
 * @param participants `[{ id, moderator }]`
 * @param localId      The viewer's participant id, if any.
 */
export function orderForPresenting(participants, localId) {
  const isLocal = (participant) => participant.id === localId;
  return [
    ...participants.filter((participant) => !participant.moderator && !isLocal(participant)),
    ...participants.filter((participant) => participant.moderator && !isLocal(participant)),
    ...participants.filter(isLocal),
  ];
}