import { SystemSettings } from '../models/SystemSettings.js';
import { disconnectRoleTestSessions } from '../realtime/connections.js';
import { logActivity } from '../utils/activityLogger.js';
import { DEFAULT_SESSION_RATE, roundAmount } from '../utils/salary.js';

/** Settings always come back whole, with their defaults filled in. */
function settingsResult(settings) {
  return {
    roleTestingEnabled: settings?.roleTestingEnabled ?? false,
    defaultSessionRate: roundAmount(settings?.defaultSessionRate ?? DEFAULT_SESSION_RATE),
  };
}

function describeChanges({ roleTestingEnabled, defaultSessionRate }) {
  const changes = [];
  if (roleTestingEnabled !== undefined) {
    changes.push(`temporary role testing ${roleTestingEnabled ? 'enabled' : 'disabled'}`);
  }
  if (defaultSessionRate !== undefined) {
    changes.push(`the class rate set to ${roundAmount(defaultSessionRate)}`);
  }
  return `System settings updated: ${changes.join(', ')}`;
}

export async function getSystemSettings() {
  return settingsResult(await SystemSettings.findById('system').lean());
}

export async function updateSystemSettings(changes, { actor, ipAddress } = {}) {
  const patch = {};
  if (changes.roleTestingEnabled !== undefined) patch.roleTestingEnabled = changes.roleTestingEnabled;
  if (changes.defaultSessionRate !== undefined) patch.defaultSessionRate = changes.defaultSessionRate;

  const settings = await SystemSettings.findByIdAndUpdate(
    'system',
    { $set: { ...patch, updatedBy: actor?._id } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  await logActivity({
    actorId: actor?._id,
    action: 'system-settings.updated',
    entityType: 'SystemSettings',
    description: describeChanges(changes),
    ipAddress,
  });
  if (changes.roleTestingEnabled === false) {
    await disconnectRoleTestSessions('Temporary role testing has been disabled. Please sign in with your account.');
  }

  return settingsResult(settings);
}
