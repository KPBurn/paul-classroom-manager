// Shared by the Zoom test files.
export const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A stand-in for Zoom's API: it keeps meetings in memory and records every call. */
export function fakeZoom() {
  const zoom = { meetings: new Map(), calls: [], nextId: 81_000_000_001, tokens: 0 };
  zoom.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    zoom.calls.push({ method, url, options });
    if (url.href.startsWith('https://zoom.us/oauth/token')) {
      zoom.tokens += 1;
      return response(200, { access_token: `token-${zoom.tokens}`, expires_in: 3600 });
    }
    const meetingPath = url.pathname.match(/^\/v2\/meetings\/(\d+)(\/status)?$/);
    if (method === 'POST' && url.pathname === '/v2/users/me/meetings') {
      const id = zoom.nextId;
      zoom.nextId += 1;
      zoom.meetings.set(String(id), { id, ...JSON.parse(options.body), ended: false });
      return response(201, { id, join_url: `https://zoom.us/j/${id}?pwd=secret`, start_url: `https://zoom.us/s/${id}?zak=host` });
    }
    const meeting = meetingPath && zoom.meetings.get(meetingPath[1]);
    if (!meeting) return response(404, { code: 3001, message: 'Meeting does not exist' });
    if (method === 'GET') {
      return response(200, { id: meeting.id, join_url: `https://zoom.us/j/${meeting.id}?pwd=secret`, start_url: `https://zoom.us/s/${meeting.id}?zak=fresh` });
    }
    if (method === 'PUT' && meetingPath[2]) {
      meeting.ended = true;
      return response(204);
    }
    if (method === 'DELETE') {
      zoom.meetings.delete(meetingPath[1]);
      return response(204);
    }
    return response(400, { code: 300, message: 'Unexpected request' });
  };
  return zoom;
}
