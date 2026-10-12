const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function parseIceServers(value) {
  if (!value) return [{ urls: 'stun:stun.l.google.com:19302' }];
  let iceServers;
  try {
    iceServers = JSON.parse(value);
  } catch {
    throw new Error('WEBRTC_ICE_SERVERS must be a JSON array of WebRTC ICE server definitions');
  }
  if (!Array.isArray(iceServers) || iceServers.some((server) => (
    !server || typeof server !== 'object' || Array.isArray(server)
      || !(typeof server.urls === 'string' || (Array.isArray(server.urls) && server.urls.length > 0
        && server.urls.every((url) => typeof url === 'string')))
      || (server.username !== undefined && typeof server.username !== 'string')
      || (server.credential !== undefined && typeof server.credential !== 'string')
  ))) {
    throw new Error('WEBRTC_ICE_SERVERS must contain valid WebRTC ICE server definitions');
  }
  return iceServers;
}

function parseMeteredTurnHost(value) {
  if (!value) return null;
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.metered\.live$/.test(host)) {
    throw new Error('METERED_TURN_HOST must be your Metered subdomain ending in .metered.live');
  }
  return host;
}

/**
 * A Zoom Server-to-Server OAuth app from the environment: all three values or none. Credentials
 * saved in System Settings win over these (see systemSettings.service, resolveZoomSettings).
 */
function parseZoom() {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  const configured = [accountId, clientId, clientSecret].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 3) {
    throw new Error('ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET must all be configured');
  }
  return { accountId, clientId, clientSecret };
}

const meteredTurnHost = parseMeteredTurnHost(process.env.METERED_TURN_HOST);
const meteredTurnApiKey = process.env.METERED_TURN_API_KEY?.trim() || null;
if (Boolean(meteredTurnHost) !== Boolean(meteredTurnApiKey)) {
  throw new Error('METERED_TURN_HOST and METERED_TURN_API_KEY must both be configured');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 5050),
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrls: toList(process.env.CLIENT_URL || 'http://localhost:5173'),
  trustProxy: toInt(process.env.TRUST_PROXY, 0),
  iceServers: parseIceServers(process.env.WEBRTC_ICE_SERVERS),
  meteredTurnHost,
  meteredTurnApiKey,
  zoom: parseZoom(),
  // The Zoom user who hosts the meetings; `me` is the account that made the app.
  zoomHostUser: process.env.ZOOM_HOST_USER?.trim() || 'me',
  // Zoom ends meetings hosted on a free (Basic) account after 40 minutes. 0 means the account has no limit.
  zoomMeetingTimeLimitMinutes: Math.max(0, toInt(process.env.ZOOM_MEETING_TIME_LIMIT_MINUTES, 40)),
  // Where the web app is opened, for links in emails. Defaults to the first allowed origin.
  appUrl: (process.env.APP_URL || toList(process.env.CLIENT_URL || 'http://localhost:5173')[0]).replace(/\/+$/, ''),
  // Email is sent through Resend's API. Without a key, emails are skipped and the server says so in its log.
  resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
  mailFrom: process.env.MAIL_FROM?.trim() || 'Classroom Manager <onboarding@resend.dev>',
  // Days to keep applications that were not approved. Unset keeps them until an administrator removes them.
  enrollmentRetentionDays: toInt(process.env.ENROLLMENT_RETENTION_DAYS, 0),
};

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

const MIN_JWT_SECRET_LENGTH = 32;

/** Fails fast with a readable message instead of crashing later on first use. */
export function assertRequiredEnv() {
  const problems = [];

  if (!env.mongodbUri) {
    problems.push('MONGODB_URI must be set to a reachable MongoDB database');
  } else if (/<[^>]*>/.test(env.mongodbUri)) {
    const placeholders = env.mongodbUri.match(/<[^>]*>/g).join(', ');
    problems.push(`MONGODB_URI still contains ${placeholders} — replace it (including the < >) with the real value`);
  }
  if (!env.jwtSecret || env.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
