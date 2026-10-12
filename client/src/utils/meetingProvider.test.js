import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lobbyMeeting, meetingProviderOf, withMeetingProvider } from './meetingProvider.js';

const zoomOn = { enabled: true, timeLimitMinutes: 40 };

describe('meetingProviderOf', () => {
  it('is Zoom only when the teacher chose it, and the class room otherwise', () => {
    assert.equal(meetingProviderOf({ meetingProvider: 'zoom' }), 'zoom');
    assert.equal(meetingProviderOf({ meetingProvider: 'builtin' }), 'builtin');
    assert.equal(meetingProviderOf({}), 'builtin');
    assert.equal(meetingProviderOf({ meetingProvider: 'skype' }), 'builtin');
    // A Zoom meeting left from before does not make it a Zoom class.
    assert.equal(meetingProviderOf({ zoomMeeting: true }), 'builtin');
    assert.equal(meetingProviderOf(null), 'builtin');
  });
});

describe('withMeetingProvider', () => {
  it('forgets the Zoom meeting when a class moves back to its room, and keeps the rest', () => {
    const session = { id: 'a', title: 'Lesson', meetingProvider: 'zoom', zoomMeeting: true };
    assert.deepEqual(withMeetingProvider(session, 'builtin'), { id: 'a', title: 'Lesson', meetingProvider: 'builtin', zoomMeeting: false });
    // Moving to Zoom keeps whatever meeting the page knows of; the teacher opens one if there is none.
    assert.deepEqual(withMeetingProvider({ ...session, meetingProvider: 'builtin' }, 'zoom'), session);
  });
});

describe('lobbyMeeting', () => {
  it('offers students only the class room when the teacher chose it', () => {
    const offer = lobbyMeeting({ meetingProvider: 'builtin', zoom: zoomOn, zoomMeeting: true });
    assert.deepEqual(offer, { provider: 'builtin', offersRoom: true, zoomState: null, canChoose: false, zoomChoosable: true });
  });

  it('offers students only Zoom when the teacher chose it, once the meeting is open', () => {
    assert.deepEqual(
      lobbyMeeting({ meetingProvider: 'zoom', zoom: zoomOn, zoomMeeting: false }),
      { provider: 'zoom', offersRoom: false, zoomState: 'waiting', canChoose: false, zoomChoosable: true },
    );
    const open = lobbyMeeting({ meetingProvider: 'zoom', zoom: zoomOn, zoomMeeting: true });
    assert.equal(open.offersRoom, false);
    assert.equal(open.zoomState, 'join');
  });

  it('never offers both when the choice is missing or unknown', () => {
    for (const meetingProvider of [undefined, null, '', 'skype']) {
      const offer = lobbyMeeting({ meetingProvider, zoom: zoomOn, zoomMeeting: true });
      assert.equal(offer.offersRoom, true);
      assert.equal(offer.zoomState, null);
    }
  });

  it('keeps a Zoom class in Zoom when Zoom is switched off, instead of opening the room', () => {
    const student = lobbyMeeting({ meetingProvider: 'zoom', zoom: { enabled: false }, zoomMeeting: true });
    assert.equal(student.offersRoom, false);
    assert.equal(student.zoomState, 'unavailable');
    // The teacher can still move it back to the class room, but not pick Zoom.
    const teacher = lobbyMeeting({ meetingProvider: 'zoom', zoom: { enabled: false } }, { canManageRoom: true });
    assert.equal(teacher.canChoose, true);
    assert.equal(teacher.zoomChoosable, false);
  });

  it('gives teachers the choice and the host action of the chosen meeting', () => {
    const inZoom = lobbyMeeting({ meetingProvider: 'zoom', zoom: zoomOn }, { canManageRoom: true });
    assert.equal(inZoom.zoomState, 'host');
    assert.equal(inZoom.offersRoom, false);
    assert.equal(inZoom.canChoose, true);
    const inRoom = lobbyMeeting({ meetingProvider: 'builtin', zoom: zoomOn }, { canManageRoom: true });
    assert.equal(inRoom.offersRoom, true);
    assert.equal(inRoom.canChoose, true);
    // Without Zoom set up there is nothing to choose.
    assert.equal(lobbyMeeting({ meetingProvider: 'builtin', zoom: { enabled: false } }, { canManageRoom: true }).canChoose, false);
  });
});
