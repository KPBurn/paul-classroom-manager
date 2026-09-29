import { SystemSettings } from '../models/SystemSettings.js';
import { logActivity } from '../utils/activityLogger.js';

export async function getSystemSettings() {
  const settings = await SystemSettings.findById('system').lean();
  return { roleTestingEnabled: settings?.roleTestingEnabled ?? false };
}

export async function updateSystemSettings({ roleTestingEnabled }, { actor, ipAddress } = {}) {
  const settings = await SystemSettings.findByIdAndUpdate(
    'system',
    { $set: { roleTestingEnabled, updatedBy: actor?._id } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );

  await logActivity({
    actorId: actor?._id,
    action: 'system-settings.role-testing',
    entityType: 'SystemSettings',
    description: `Temporary role testing ${roleTestingEnabled ? 'enabled' : 'disabled'}`,
    ipAddress,
  });

  return { roleTestingEnabled: settings.roleTestingEnabled };
}
