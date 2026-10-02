import { useEffect, useRef, useState } from 'react';
import { selectPanes } from './selectPanes.js';

const REFRESH_MS = 1_000;

/**
 * The students to show in the class monitor, chosen by `selectPanes`.
 * `students` carry `id`, `name`, `isSpeaking` and `cameraEnabled`.
 * Returns `{ panes, hiddenCount }`, where `panes` are the chosen students in display order.
 */
export function usePaneSelection(students) {
  const [slots, setSlots] = useState([]);
  const latest = useRef(students);
  latest.current = students;
  // When each student last spoke and the order they first appeared, remembered between updates.
  const memory = useRef({ lastSpokeAt: new Map(), joinOrder: new Map(), next: 0 });

  // Changes that can alter the choice; other re-renders of the room are ignored.
  const signature = students
    .map((student) => `${student.id}:${student.isSpeaking ? 1 : 0}${student.cameraEnabled ? 1 : 0}`)
    .join('|');

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const { lastSpokeAt, joinOrder } = memory.current;
      const present = new Set(latest.current.map((student) => student.id));
      for (const id of joinOrder.keys()) {
        if (!present.has(id)) {
          joinOrder.delete(id);
          lastSpokeAt.delete(id);
        }
      }
      const candidates = latest.current.map((student) => {
        if (!joinOrder.has(student.id)) joinOrder.set(student.id, (memory.current.next += 1));
        if (student.isSpeaking) lastSpokeAt.set(student.id, now);
        return {
          id: student.id,
          name: student.name,
          speaking: Boolean(student.isSpeaking),
          cameraEnabled: Boolean(student.cameraEnabled),
          lastSpokeAt: lastSpokeAt.get(student.id),
          joinOrder: joinOrder.get(student.id),
        };
      });
      setSlots((previous) => selectPanes(previous, candidates, now));
    };
    update();
    // Time passing matters too: a speaker's hold runs out, and a pane becomes free to reassign.
    const timer = window.setInterval(update, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [signature]);

  const byId = new Map(students.map((student) => [student.id, student]));
  const panes = slots.map((slot) => byId.get(slot.id)).filter(Boolean);
  return { panes, hiddenCount: Math.max(0, students.length - panes.length) };
}
