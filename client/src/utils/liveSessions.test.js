import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySessionEvent, describePresence, presenceNames } from './liveSessions.js';
import { sessionPhase } from './sessionTiming.js';

const NOW = Date.parse('2026-03-02T10:00:00Z');
const session = (id, overrides = {}) => ({
  id,
  title: `Lesson ${id}`,
  classroom: { id: 'c1', name: 'Class' },
  startsAt: '2026-03-02T09:00:00.000Z',
  endsAt: '2026-03-02T11:00:00.000Z',
  status: 'scheduled',
  endedAt: null,
  attendance: { status: null },
  ...overrides,
});

describe('applySessionEvent', () => {
  it('adds a session that has just started and shows it as live at once', () => {
    const list = [session('a')];
    // The server's clock is two seconds ahead of this browser's.
    const started = session('b', { startsAt: new Date(NOW + 2_000).toISOString() });
    const next = applySessionEvent(list, 'started', { session: started, receivedAt: NOW });
    assert.equal(next.length, 2);
    assert.equal(sessionPhase(next[1], NOW), 'live');
    assert.equal(list.length, 1);
  });

  it('leaves out a started session the page does not list', () => {
    const list = [session('a')];
    const next = applySessionEvent(list, 'started', { session: session('b'), receivedAt: NOW }, () => false);
    assert.equal(next, list);
  });

  it('updates a scheduled session that was started early and keeps the reader’s attendance', () => {
    const mine = { status: 'present', durationMs: 5 };
    const list = [session('a', { startsAt: '2026-03-02T10:10:00.000Z', attendance: mine })];
    const next = applySessionEvent(
      list,
      'started',
      { session: session('a', { startsAt: '2026-03-02T10:00:00.000Z' }), receivedAt: NOW },
      () => false,
    );
    assert.equal(next.length, 1);
    assert.equal(next[0].startsAt, '2026-03-02T10:00:00.000Z');
    assert.equal(next[0].attendance, mine);
    assert.equal(applySessionEvent(next, 'started', { session: session('a'), receivedAt: NOW }).length, 1);
  });

  it('marks a class as ended and as open again', () => {
    const list = [session('a'), session('b')];
    const ended = applySessionEvent(list, 'ended', { sessionId: 'b', endedAt: '2026-03-02T09:30:00.000Z' });
    assert.equal(sessionPhase(ended[1], NOW), 'closed');
    assert.equal(ended[0], list[0]);
    const reopened = applySessionEvent(ended, 'reopened', { sessionId: 'b', endedAt: null });
    assert.equal(sessionPhase(reopened[1], NOW), 'live');
  });

  it('returns the same list for events about other sessions', () => {
    const list = [session('a')];
    assert.equal(applySessionEvent(list, 'ended', { sessionId: 'zzz', endedAt: 'x' }), list);
    assert.equal(applySessionEvent(list, 'presence', { sessionId: 'a', count: 3 }), list);
  });
});

describe('describePresence', () => {
  const teacher = { id: 't1', name: 'Maria Reyes' };

  it('says when the room is empty', () => {
    assert.equal(describePresence(undefined), 'No one is in the room yet');
    assert.equal(describePresence({ count: 0, teachers: [] }), 'No one is in the room yet');
  });

  it('says when students are waiting for the teacher', () => {
    assert.equal(describePresence({ count: 1, teachers: [] }), '1 person in the room · waiting for the teacher');
    assert.equal(describePresence({ count: 4, teachers: [] }), '4 people in the room · waiting for the teacher');
  });

  it('names the teachers who are in the room', () => {
    assert.equal(describePresence({ count: 1, teachers: [teacher] }), 'Maria Reyes is in the room');
    assert.equal(describePresence({ count: 6, teachers: [teacher] }), 'Maria Reyes is in the room with 5 people');
    assert.equal(
      describePresence({ count: 3, teachers: [teacher, { id: 't2', name: 'Jo Tan' }] }),
      'Maria Reyes and Jo Tan are in the room with 1 person',
    );
  });
});

describe('presenceNames', () => {
  it('lists the names staff are given and shortens a long list', () => {
    const participants = ['Ana', 'Ben', 'Cy', 'Di', 'Ed'].map((name) => ({ name }));
    assert.equal(presenceNames({ participants: participants.slice(0, 2) }), 'Ana, Ben');
    assert.equal(presenceNames({ participants }), 'Ana, Ben, Cy +2');
    assert.equal(presenceNames({ count: 2 }), '');
  });
});
