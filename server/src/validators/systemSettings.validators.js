import { z } from 'zod';

// Same shape the server environment accepts (see environment.js): a Metered subdomain.
const METERED_HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.metered\.live$/;

/** A JSON array of ICE servers, e.g. `[{"urls":"stun:stun.example.com:3478"}]`. Empty means "not set". */
function isValidIceServersJson(value) {
  if (value.trim() === '') return true;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  return parsed.every((server) => {
    if (!server || typeof server !== 'object' || Array.isArray(server)) return false;
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.length > 0
      && urls.every((url) => typeof url === 'string' && /^(stun|turn)s?:/i.test(url))
      && (server.username === undefined || typeof server.username === 'string')
      && (server.credential === undefined || typeof server.credential === 'string');
  });
}

// An empty string clears a value; only defined keys are written (see systemSettings.service).
export const updateSystemSettingsSchema = z
  .object({
    roleTestingEnabled: z.boolean(),
    classroomIntegration: z.enum(['webrtc', 'zoom']),
    webrtc: z
      .object({
        meteredTurnHost: z
          .string()
          .trim()
          .max(100, 'Turn relay host must be at most 100 characters')
          .refine((value) => value === '' || METERED_HOST_PATTERN.test(value), {
            message: 'Enter your Metered subdomain ending in .metered.live, or leave it empty',
          }),
        // A secret: stored but never returned by the API; empty clears it.
        meteredTurnApiKey: z.string().max(300, 'API key must be at most 300 characters'),
        iceServersJson: z
          .string()
          .max(10_000, 'ICE servers JSON must be at most 10000 characters')
          .refine(isValidIceServersJson, {
            message: 'Must be a JSON array of ICE servers, e.g. [{"urls":"stun:stun.example.com:3478"}]',
          }),
      })
      .partial(),
    zoom: z
      .object({
        accountId: z.string().trim().max(100, 'Account ID must be at most 100 characters'),
        clientId: z.string().trim().max(100, 'Client ID must be at most 100 characters'),
        // A secret: stored but never returned by the API; empty clears it.
        clientSecret: z.string().max(300, 'Client secret must be at most 300 characters'),
      })
      .partial(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one setting to update');
