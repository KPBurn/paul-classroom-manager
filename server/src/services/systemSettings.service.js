import { env } from '../config/environment.js';
import { SystemSettings } from '../models/SystemSettings.js';
import { disconnectRoleTestSessions } from '../realtime/connections.js';
import { logActivity } from '../utils/activityLogger.js';
import { fetchMeteredTurnIceServers } from './meteredTurn.service.js';

const DEFAULT_WEBRTC = { meteredTurnHost: '', meteredTurnApiKey: '', iceServersJson: '' };
const DEFAULT_ZOOM = { accountId: '', clientId: '', clientSecret: '' };

/**
 * The settings as an administrator sees them. Secrets are replaced by `…Set`
 * flags so the API never sends them back to the browser.
 */
export async function getSystemSettings() {
  const settings = await SystemSettings.findById('system').lean();
  const webrtc = { ...DEFAULT_WEBRTC, ...(settings?.webrtc ?? {}) };
  const zoom = { ...DEFAULT_ZOOM, ...(settings?.zoom ?? {}) };
  return {
    roleTestingEnabled: settings?.roleTestingEnabled ?? false,
    classroomIntegration: settings?.classroomIntegration ?? 'webrtc',
    webrtc: {
      meteredTurnHost: webrtc.meteredTurnHost || '',
      meteredTurnApiKeySet: Boolean(webrtc.meteredTurnApiKey),
      iceServersJson: webrtc.iceServersJson || '',
      // What the server environment already provides. Values saved here win over these.
      envConfigured: {
        meteredTurnHost: Boolean(env.meteredTurnHost),
        meteredTurnApiKey: Boolean(env.meteredTurnApiKey),
        iceServers: Boolean(process.env.WEBRTC_ICE_SERVERS),
      },
    },
    zoom: {
      accountId: zoom.accountId || '',
      clientId: zoom.clientId || '',
      clientSecretSet: Boolean(zoom.clientSecret),
    },
  };
}

/**
 * Saves only the keys present in `payload` (an empty string clears a secret),
 * records who changed what, and returns the settings in their public shape.
 */
export async function updateSystemSettings(payload, { actor, ipAddress } = {}) {
  const $set = { updatedBy: actor?._id };
  if (payload.roleTestingEnabled !== undefined) $set.roleTestingEnabled = payload.roleTestingEnabled;
  if (payload.classroomIntegration !== undefined) $set.classroomIntegration = payload.classroomIntegration;
  for (const key of Object.keys(payload.webrtc ?? {})) $set[`webrtc.${key}`] = payload.webrtc[key];
  for (const key of Object.keys(payload.zoom ?? {})) $set[`zoom.${key}`] = payload.zoom[key];

  await SystemSettings.findByIdAndUpdate(
    'system',
    { $set },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  const log = (action, description) =>
    logActivity({ actorId: actor?._id, action, entityType: 'SystemSettings', description, ipAddress });

  if (payload.classroomIntegration !== undefined) {
    await log(
      'system-settings.classroom-integration',
      `Classroom integration set to ${payload.classroomIntegration === 'zoom' ? 'Zoom' : 'WebRTC'}`,
    );
  }
  if (payload.webrtc !== undefined) {
    await log('system-settings.webrtc-config', 'WebRTC relay configuration updated');
  }
  if (payload.zoom !== undefined) {
    await log('system-settings.zoom-config', 'Zoom integration credentials updated');
  }
  if (payload.roleTestingEnabled !== undefined) {
    await log(
      'system-settings.role-testing',
      `Temporary role testing ${payload.roleTestingEnabled ? 'enabled' : 'disabled'}`,
    );
    if (!payload.roleTestingEnabled) {
      await disconnectRoleTestSessions('Temporary role testing has been disabled. Please sign in with your account.');
    }
  }

  return getSystemSettings();
}

/**
 * The ICE servers live rooms use. Credentials saved in the admin console win
 * over the server environment: a Metered host + API key pair, then a static
 * JSON list, and finally the environment defaults.
 */
export async function resolveIceServers() {
  const settings = await SystemSettings.findById('system').lean();
  const host = settings?.webrtc?.meteredTurnHost?.trim();
  const apiKey = settings?.webrtc?.meteredTurnApiKey?.trim();
  if (host && apiKey) return fetchMeteredTurnIceServers(host, apiKey);

  const json = settings?.webrtc?.iceServersJson?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      console.error('Stored ICE servers JSON is not a non-empty array; falling back to the environment');
    } catch {
      console.error('Stored ICE servers JSON could not be parsed; falling back to the environment');
    }
  }

  if (env.meteredTurnHost && env.meteredTurnApiKey) {
    return fetchMeteredTurnIceServers(env.meteredTurnHost, env.meteredTurnApiKey);
  }
  return env.iceServers;
}
