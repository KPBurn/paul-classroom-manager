import * as sessionService from '../services/session.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function list(req, res) {
  const data = await sessionService.listSessions(req.user, req.validatedQuery);
  sendSuccess(res, { data });
}

export async function create(req, res) {
  const items = await sessionService.createSessions(req.body, { actor: req.user, ipAddress: req.ip });
  sendSuccess(res, { status: 201, message: 'Session(s) scheduled successfully', data: { items } });
}

export async function checkIn(req, res) {
  const session = await sessionService.checkIn(req.params.id, req.user);
  sendSuccess(res, { message: 'Checked in successfully', data: { session } });
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
