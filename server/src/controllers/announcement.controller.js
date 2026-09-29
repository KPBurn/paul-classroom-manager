import * as announcementService from '../services/announcement.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function create(req, res) {
  const announcement = await announcementService.createAnnouncement(req.body, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { status: 201, message: 'Announcement created successfully', data: { announcement } });
}

export async function list(req, res) {
  const data = await announcementService.listAnnouncements(req.validatedQuery);
  sendSuccess(res, { data });
}
