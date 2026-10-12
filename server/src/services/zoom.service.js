import { AppError } from '../utils/AppError.js';

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_URL = 'https://api.zoom.us/v2';
const REQUEST_TIMEOUT_MS = 8_000;
// A token is renewed this long before Zoom says it runs out, so a request never carries an expired one.
const TOKEN_RENEW_MARGIN_MS = 60_000;
const UNAVAILABLE = 'Zoom is unavailable right now. Please try again shortly, or use the class room.';

/** Zoom wants `yyyy-MM-ddTHH:mm:ssZ`, without milliseconds. */
const zoomTime = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

const meetingResult = (meeting) => ({
  id: String(meeting.id),
  joinUrl: meeting.join_url,
  startUrl: meeting.start_url,
});

/**
 * Talks to Zoom's REST API as a Server-to-Server OAuth app on the school's
 * Zoom account. Meetings are hosted by `hostUser` (`me` is the account that
 * made the app). The client secret and access tokens stay in this module:
 * they are never returned or logged.
 */
export function createZoomClient({ accountId, clientId, clientSecret, hostUser = 'me', fetchImpl = (...args) => fetch(...args) }) {
  let token = null;
  let pendingToken = null;

  async function requestToken() {
    const url = new URL(TOKEN_URL);
    url.searchParams.set('grant_type', 'account_credentials');
    url.searchParams.set('account_id', accountId);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error('Unable to reach Zoom to sign in', error.name);
      throw new AppError(503, UNAVAILABLE);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.access_token !== 'string') {
      console.error('Zoom refused the app sign-in', response.status);
      throw new AppError(503, 'Zoom could not be signed in to. An administrator should check the Zoom settings.');
    }
    return { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 - TOKEN_RENEW_MARGIN_MS };
  }

  /** One sign-in at a time; everyone waiting shares it. */
  async function accessToken() {
    if (token && token.expiresAt > Date.now()) return token.value;
    pendingToken ??= requestToken().finally(() => {
      pendingToken = null;
    });
    token = await pendingToken;
    return token.value;
  }

  async function call(method, path, body, { retried = false } = {}) {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Unable to reach the Zoom API', method, error.name);
      throw new AppError(503, UNAVAILABLE);
    }
    // A token Zoom no longer accepts (revoked, or the app's settings changed): sign in again once.
    if (response.status === 401 && !retried) {
      token = null;
      return call(method, path, body, { retried: true });
    }
    if (response.status === 204) return null;
    const result = await response.json().catch(() => null);
    if (response.ok) return result;
    // Zoom's own code and message say what went wrong (a missing scope, for example) and hold nothing secret.
    console.error('The Zoom API returned an error', method, response.status, result?.code, result?.message);
    if (response.status === 404) throw new AppError(404, 'The Zoom meeting for this class no longer exists.');
    throw new AppError(502, 'Zoom did not accept the request. An administrator should check the Zoom settings.');
  }

  return {
    /**
     * A meeting anyone with its link can enter at any time, before the host
     * too, so a class can be joined early as it can in the class room.
     */
    async createMeeting({ topic, startsAt, endsAt, timezone }) {
      const meeting = await call('POST', `/users/${encodeURIComponent(hostUser)}/meetings`, {
        topic: topic.slice(0, 200),
        type: 2,
        start_time: zoomTime(startsAt),
        duration: Math.max(1, Math.ceil((endsAt - startsAt) / 60_000)),
        timezone,
        settings: {
          join_before_host: true,
          jbh_time: 0,
          waiting_room: false,
          mute_upon_entry: true,
          approval_type: 2,
        },
      });
      return meetingResult(meeting);
    },

    /** Includes a fresh host link; Zoom's host links stop working after a while, so they are never kept. */
    async getMeeting(meetingId) {
      return meetingResult(await call('GET', `/meetings/${encodeURIComponent(meetingId)}`));
    },

    async endMeeting(meetingId) {
      await call('PUT', `/meetings/${encodeURIComponent(meetingId)}/status`, { action: 'end' });
    },

    async deleteMeeting(meetingId) {
      await call('DELETE', `/meetings/${encodeURIComponent(meetingId)}`);
    },
  };
}
