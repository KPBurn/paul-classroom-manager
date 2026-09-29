import { AppError } from '../utils/AppError.js';

function isIceServer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const urls = Array.isArray(value.urls) ? value.urls : [value.urls];
  return urls.length > 0
    && urls.every((url) => typeof url === 'string' && /^(stun|turn)s?:/i.test(url))
    && (value.username === undefined || typeof value.username === 'string')
    && (value.credential === undefined || typeof value.credential === 'string');
}

export async function fetchMeteredTurnIceServers(host, apiKey, fetchImpl = fetch) {
  const credentialsUrl = new URL(`https://${host}/api/v1/turn/credentials`);
  credentialsUrl.searchParams.set('apiKey', apiKey);

  let response;
  try {
    response = await fetchImpl(credentialsUrl, { signal: AbortSignal.timeout(8_000) });
  } catch (error) {
    console.error('Unable to reach the Metered TURN credential service', error.name);
    throw new AppError(503, 'Classroom media relay is temporarily unavailable. Please try again shortly.');
  }

  if (!response.ok) {
    console.error('Metered TURN credential service returned an error', response.status);
    throw new AppError(503, 'Classroom media relay credentials could not be issued. Please contact an administrator.');
  }

  let iceServers;
  try {
    iceServers = await response.json();
  } catch {
    console.error('Metered TURN credential service returned invalid JSON');
    throw new AppError(503, 'Classroom media relay returned an invalid response. Please contact an administrator.');
  }

  if (!Array.isArray(iceServers) || iceServers.length === 0 || !iceServers.every(isIceServer)
    || !iceServers.some(({ urls }) => (Array.isArray(urls) ? urls : [urls])
      .some((url) => /^(turn|turns):/i.test(url)))) {
    console.error('Metered TURN credential service returned invalid ICE server definitions');
    throw new AppError(503, 'Classroom media relay returned invalid credentials. Please contact an administrator.');
  }

  return iceServers;
}
