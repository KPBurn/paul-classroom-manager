import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MIN_SHOWN_MS, selectPanes, SPEAKER_HOLD_MS } from './selectPanes.js';

let order = 0;
const student = (id, extra = {}) => ({ id, name: id, speaking: false, cameraEnabled: false, joinOrder: (order += 1), ...extra });
const ids = (panes) => panes.map((pane) => pane.id);
const T = 100_000;

describe('selectPanes', () => {
  it('shows everyone when there are four students or fewer, in the order they joined', () => {
    const students = [student('a'), student('b'), student('c')];
    assert.deepEqual(ids(selectPanes([], students, T)), ['a', 'b', 'c']);
    assert.deepEqual(selectPanes([], [], T), []);
  });

  it('prefers speakers, then cameras, then the rest', () => {
    const students = [
      student('quiet1'), student('quiet2'), student('quiet3'), student('quiet4'),
      student('camera', { cameraEnabled: true }),
      student('speaker', { speaking: true }),
    ];
    assert.deepEqual(ids(selectPanes([], students, T)), ['speaker', 'camera', 'quiet1', 'quiet2']);
  });

  it('keeps a student who just stopped speaking ahead of the cameras for a moment', () => {
    const students = [
      student('c1', { cameraEnabled: true }), student('c2', { cameraEnabled: true }),
      student('c3', { cameraEnabled: true }), student('c4', { cameraEnabled: true }),
      student('paused', { lastSpokeAt: T - (SPEAKER_HOLD_MS - 1) }),
      student('silent', { lastSpokeAt: T - (SPEAKER_HOLD_MS + 1) }),
    ];
    const panes = ids(selectPanes([], students, T));
    assert.ok(panes.includes('paused'));
    assert.ok(!panes.includes('silent'));
  });

  it('does not move students who are already shown', () => {
    const students = [student('a'), student('b'), student('c'), student('d')];
    const first = selectPanes([], students, T);
    // Later, "d" turns their camera on: they rank higher but keep their pane.
    const second = selectPanes(first, students.map((item) => (item.id === 'd' ? { ...item, cameraEnabled: true } : item)), T + 10_000);
    assert.deepEqual(ids(second), ['a', 'b', 'c', 'd']);
    assert.equal(second, first, 'the same array is returned when nothing changed');
  });

  it('gives a speaker the pane of the lowest-priority student, once that student has had their time', () => {
    const shown = [student('a', { cameraEnabled: true }), student('b'), student('c'), student('d')];
    const first = selectPanes([], shown, T);
    const withSpeaker = [...shown, student('speaker', { speaking: true })];

    const tooSoon = selectPanes(first, withSpeaker, T + MIN_SHOWN_MS - 1);
    assert.deepEqual(ids(tooSoon), ['a', 'b', 'c', 'd']);

    // "d" joined last among those without a camera, so "d" makes way; the others stay put.
    const later = selectPanes(first, withSpeaker, T + MIN_SHOWN_MS);
    assert.deepEqual(ids(later), ['a', 'b', 'c', 'speaker']);
  });

  it('never replaces a student with one from the same group', () => {
    const students = ['a', 'b', 'c', 'd', 'e'].map((id) => student(id, { speaking: true }));
    const first = selectPanes([], students.slice(0, 4), T);
    assert.deepEqual(ids(selectPanes(first, students, T + 60_000)), ['a', 'b', 'c', 'd']);
  });

  it('shows the four most recent speakers when more than four are speaking', () => {
    const students = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => student(id, { speaking: true, lastSpokeAt: T - index }));
    assert.deepEqual(ids(selectPanes([], students, T)), ['a', 'b', 'c', 'd']);
  });

  it('refills a pane when its student leaves', () => {
    const students = [student('a'), student('b'), student('c'), student('d'), student('e')];
    const first = selectPanes([], students, T);
    const afterLeave = selectPanes(first, students.filter((item) => item.id !== 'b'), T + 1);
    assert.deepEqual(ids(afterLeave), ['a', 'c', 'd', 'e']);
    // With nobody waiting, the monitor simply shows fewer panes.
    assert.deepEqual(ids(selectPanes(afterLeave, [students[0]], T + 2)), ['a']);
  });

  it('breaks ties the same way every time', () => {
    const students = [
      student('late', { joinOrder: 9 }), student('zed', { joinOrder: 5 }), student('amy', { joinOrder: 5 }),
    ];
    assert.deepEqual(ids(selectPanes([], students, T)), ['amy', 'zed', 'late']);
    assert.deepEqual(ids(selectPanes([], [...students].reverse(), T)), ['amy', 'zed', 'late']);
  });
});
