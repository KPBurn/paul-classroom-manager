import * as systemSettingsService from '../services/systemSettings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function show(_req, res) {
  sendSuccess(res, { data: await systemSettingsService.getSystemSettings() });
}

export async function update(req, res) {
  const data = await systemSettingsService.updateSystemSettings(req.body, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { message: 'System settings updated', data });
}
