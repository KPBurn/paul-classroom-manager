import * as announcementService from '../services/announcement.service.js';
import * as classroomService from '../services/classroom.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function list(req, res) {
  const items = await classroomService.listClassrooms(req.validatedQuery, req.user);
  sendSuccess(res, { data: { items } });
}

export async function show(req, res) {
  const classroom = await classroomService.getClassroom(req.params.id, req.user);
  sendSuccess(res, { data: { classroom } });
}

export async function listAnnouncements(req, res) {
  const data = await announcementService.listClassroomAnnouncements(req.params.id, req.validatedQuery, req.user);
  sendSuccess(res, { data });
}

export async function createAnnouncement(req, res) {
  const announcement = await announcementService.createClassroomAnnouncement(req.params.id, req.body, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { status: 201, message: 'Announcement posted successfully', data: { announcement } });
}

export async function create(req, res) {
  const classroom = await classroomService.createClassroom(req.body, { actor: req.user, ipAddress: req.ip });
  sendSuccess(res, { status: 201, message: 'Classroom created successfully', data: { classroom } });
}

export async function update(req, res) {
  const classroom = await classroomService.updateClassroom(req.params.id, req.body, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { message: 'Classroom updated successfully', data: { classroom } });
}

export async function archive(req, res) {
  const classroom = await classroomService.archiveClassroom(req.params.id, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { message: 'Classroom archived successfully', data: { classroom } });
}
