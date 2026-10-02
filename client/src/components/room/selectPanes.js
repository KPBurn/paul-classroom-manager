/**
 * Chooses which students fill the class monitor's panes.
 *
 * Priority: (1) students who are speaking, or stopped a moment ago; (2) students
 * with their camera on; (3) everyone else. Within a group: whoever spoke most
 * recently, then whoever joined first, then by name.
 *
 * Panes are kept steady so the teacher is not watching faces jump around: a
 * student stays in their pane until a higher-priority student needs it, and
 * not before they have been shown for a minimum time.
 */
export const PANE_COUNT = 4;
/** How long after they stop a student still counts as a speaker. */
export const SPEAKER_HOLD_MS = 2_000;
/** How long a student is shown before someone else may take their pane. */
export const MIN_SHOWN_MS = 4_000;

const SPEAKING = 0;
const CAMERA = 1;
const OTHER = 2;

function groupOf(student, now) {
  const spokeRecently = student.lastSpokeAt !== undefined && now - student.lastSpokeAt < SPEAKER_HOLD_MS;
  if (student.speaking || spokeRecently) return SPEAKING;
  return student.cameraEnabled ? CAMERA : OTHER;
}

const byPriority = (a, b) => a.group - b.group
  || (b.lastSpokeAt ?? 0) - (a.lastSpokeAt ?? 0)
  || a.joinOrder - b.joinOrder
  || a.name.localeCompare(b.name)
  || String(a.id).localeCompare(String(b.id));

/**
 * @param previous  The panes from the last call: `[{ id, since }]`, in display order.
 * @param students  `[{ id, name, speaking, cameraEnabled, lastSpokeAt?, joinOrder }]`.
 * @param now       The current time in milliseconds.
 * @returns The panes to show, in display order. The same array is returned when nothing changed.
 */
export function selectPanes(previous, students, now, size = PANE_COUNT) {
  const ranked = students.map((student) => ({ ...student, group: groupOf(student, now) })).sort(byPriority);
  const rank = new Map(ranked.map((student, index) => [student.id, index]));

  // Students who left give up their pane; the rest keep their place.
  const panes = previous.filter((pane) => rank.has(pane.id)).slice(0, size);
  const shown = new Set(panes.map((pane) => pane.id));

  for (const student of ranked) {
    if (shown.has(student.id)) continue;
    if (panes.length < size) {
      panes.push({ id: student.id, since: now });
      shown.add(student.id);
      continue;
    }
    // Every pane is taken: give this student the pane of the lowest-priority student
    // who is in a lower group and has been shown long enough.
    let replace = -1;
    panes.forEach((pane, index) => {
      const current = ranked[rank.get(pane.id)];
      const replaceable = current.group > student.group && now - pane.since >= MIN_SHOWN_MS;
      if (replaceable && (replace < 0 || rank.get(pane.id) > rank.get(panes[replace].id))) replace = index;
    });
    if (replace < 0) continue;
    shown.delete(panes[replace].id);
    panes[replace] = { id: student.id, since: now };
    shown.add(student.id);
  }

  const unchanged = panes.length === previous.length
    && panes.every((pane, index) => pane.id === previous[index].id && pane.since === previous[index].since);
  return unchanged ? previous : panes;
}
