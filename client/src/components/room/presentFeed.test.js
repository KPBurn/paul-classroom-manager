import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FEED_ROW_HEIGHTS, orderForPresenting } from './presentFeed.js';

const person = (id, moderator = false) => ({ id, moderator });
const ids = (participants) => participants.map((participant) => participant.id);

describe('orderForPresenting', () => {
  it('shows students first, then teachers, with the viewer last', () => {
    const participants = [person('teacher', true), person('s1'), person('s2'), person('me')];
    assert.deepEqual(ids(orderForPresenting(participants, 'me')), ['s1', 's2', 'teacher', 'me']);
  });

  it('keeps the room order inside each group', () => {
    const participants = [person('t1', true), person('s1'), person('t2', true), person('s2')];
    assert.deepEqual(ids(orderForPresenting(participants, 'nobody')), ['s1', 's2', 't1', 't2']);
  });

  it('returns everyone when there is nothing to reorder', () => {
    assert.deepEqual(ids(orderForPresenting([person('solo')], 'solo')), ['solo']);
    assert.deepEqual(orderForPresenting([], 'nobody'), []);
  });

  it('sizes the row on phones and on wider screens', () => {
    assert.match(FEED_ROW_HEIGHTS.small, /h-16/);
    assert.match(FEED_ROW_HEIGHTS.large, /h-24/);
  });
});