import * as sessionService from '../services/session.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { MAX_UPLOAD_FILE_SIZE, getSafeFileName } from '../utils/file.js';

export async function list(req, res) {
  const data = await sessionService.listSessions(req.user, req.validatedQuery);
  sendSuccess(res, { data });
}

export async function assignmentOptions(req, res) {
  const data = await sessionService.getAssignmentOptions(req.validatedQuery.classroomId, req.user);
  sendSuccess(res, { data });
}

export async function create(req, res) {
  const items = await sessionService.createSessions(req.body, { actor: req.user, ipAddress: req.ip });
  sendSuccess(res, { status: 201, message: 'Session(s) scheduled successfully', data: { items } });
}

export async function attendance(req, res) {
  const data = await sessionService.getAttendance(req.params.id, req.user);
  sendSuccess(res, { data });
}

export async function messages(req, res) {
  const data = await sessionService.listSessionMessages(req.params.id, req.user);
  sendSuccess(res, { data });
}

export async function room(req, res) {
  const session = await sessionService.getRoomSession(req.params.id, req.user);
  sendSuccess(res, { data: { session } });
}

export async function listFiles(req, res) {
  const data = await sessionService.listSessionFiles(req.params.id, req.user);
  sendSuccess(res, { data });
}

export async function uploadFile(req, res) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'Choose a file to upload');
  }
  if (req.body.length > MAX_UPLOAD_FILE_SIZE) {
    throw new AppError(413, 'Files must be 8 MB or smaller');
  }
  const file = await sessionService.createSessionFile(
    req.params.id,
    { name: getSafeFileName(req.get('x-file-name')), data: req.body },
    req.user,
  );
  sendSuccess(res, { status: 201, message: 'File uploaded', data: { file } });
}

export async function downloadFile(req, res) {
  const file = await sessionService.getSessionFile(req.params.id, req.params.fileId, req.user);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(file.data.length),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(file.data);
}

export async function correctAttendance(req, res) {
  const data = await sessionService.correctAttendance(
    req.params.id,
    req.params.studentId,
    req.body.status,
    req.user,
    { ipAddress: req.ip },
  );
  sendSuccess(res, { message: 'Attendance updated successfully', data });
}

export async function update(req, res) {
  const data = await sessionService.updateSession(req.params.id, req.body, req.user, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Session updated successfully', data });
}

export async function cancel(req, res) {
  const data = await sessionService.cancelSession(req.params.id, req.body.scope, req.user, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Session cancelled successfully', data });
}
