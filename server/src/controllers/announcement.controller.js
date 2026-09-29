import * as announcementService from '../services/announcement.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const context = (req) => ({ actor: req.user, ipAddress: req.ip });

export async function create(req, res) {
  const announcement = await announcementService.createAnnouncement(req.body, context(req));
  sendSuccess(res, { status: 201, message: 'Announcement created successfully', data: { announcement } });
}

export async function list(req, res) {
  const data = await announcementService.listAnnouncements(req.validatedQuery, req.user);
  sendSuccess(res, { data });
}

export async function update(req, res) {
  const announcement = await announcementService.updateAnnouncement(req.params.id, req.body, context(req));
  sendSuccess(res, { message: 'Announcement updated successfully', data: { announcement } });
}

export async function archive(req, res) {
  const announcement = await announcementService.setAnnouncementStatus(req.params.id, 'archived', context(req));
  sendSuccess(res, { message: 'Announcement archived successfully', data: { announcement } });
}

export async function restore(req, res) {
  const announcement = await announcementService.setAnnouncementStatus(req.params.id, 'active', context(req));
  sendSuccess(res, { message: 'Announcement restored successfully', data: { announcement } });
}

export async function remove(req, res) {
  await announcementService.deleteAnnouncement(req.params.id, context(req));
  sendSuccess(res, { message: 'Announcement deleted successfully' });
}
