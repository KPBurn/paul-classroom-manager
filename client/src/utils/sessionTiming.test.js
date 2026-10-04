import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canJoinOpenClassroomAnytime } from './sessionTiming.js';

describe('open classroom joining', () => {
  it('allows joining outside the scheduled time window', () => {
    assert.equal(canJoinOpenClassroomAnytime({
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      classroom: { openAccess: true },
    }), true);
  });

  it('does not allow joining cancelled or teacher-ended sessions', () => {
    const session = { classroom: { openAccess: true } };
    assert.equal(canJoinOpenClassroomAnytime({ ...session, status: 'cancelled' }), false);
    assert.equal(canJoinOpenClassroomAnytime({ ...session, endedAt: new Date() }), false);
  });

  it('keeps standard classrooms on their normal join rules', () => {
    assert.equal(canJoinOpenClassroomAnytime({ classroom: { openAccess: false } }), false);
  });
});
