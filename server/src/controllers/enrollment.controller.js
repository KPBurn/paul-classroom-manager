import * as enrollmentService from '../services/enrollment.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const context = (req) => ({ actor: req.user, ipAddress: req.ip });

function sendImage(res, image) {
  res.set({
    'Content-Type': image.contentType,
    'Content-Length': String(image.data.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image.data);
}

export async function classes(_req, res) {
  const data = await enrollmentService.listOpenClasses();
  sendSuccess(res, { data });
}

export async function submit(req, res) {
  const application = await enrollmentService.submitApplication(req.body, context(req));
  sendSuccess(res, { status: 201, message: 'Application submitted', data: { application } });
}

export async function uploadPhoto(req, res) {
  await enrollmentService.attachPhoto(req.params.referenceNumber, req.body);
  sendSuccess(res, { status: 201, message: 'Photo added to your application' });
}

export async function remindReference(req, res) {
  await enrollmentService.remindReference(req.body.email);
  // The same answer for every email, so this cannot be used to find out who applied.
  sendSuccess(res, { message: 'If that email has an application, its reference number is on its way.' });
}

export async function status(req, res) {
  const application = await enrollmentService.checkStatus(req.body);
  sendSuccess(res, { data: { application } });
}

export async function createAccount(req, res) {
  const account = await enrollmentService.createAccount(req.body, context(req));
  sendSuccess(res, { status: 201, message: 'Account created. You can sign in now.', data: { account } });
}

export async function requestClasses(req, res) {
  const application = await enrollmentService.requestClasses(req.user, req.body, context(req));
  sendSuccess(res, { status: 201, message: 'Request sent', data: { application } });
}

export async function ownRequests(req, res) {
  const items = await enrollmentService.listOwnRequests(req.user);
  sendSuccess(res, { data: { items } });
}

export async function withdraw(req, res) {
  const application = await enrollmentService.withdrawRequest(req.user, req.params.id, req.params.requestId, context(req));
  sendSuccess(res, { message: 'Request withdrawn', data: { application } });
}

export async function ownRecord(req, res) {
  const record = await enrollmentService.getOwnRecord(req.user);
  sendSuccess(res, { data: { record } });
}

export async function ownPhoto(req, res) {
  sendImage(res, await enrollmentService.getOwnPhoto(req.user));
}

export async function recordOf(req, res) {
  const record = await enrollmentService.getRecordOf(req.params.userId);
  sendSuccess(res, { data: { record } });
}

export async function list(req, res) {
  const data = await enrollmentService.listApplications(req.validatedQuery);
  sendSuccess(res, { data });
}

export async function show(req, res) {
  const application = await enrollmentService.getApplication(req.params.id);
  sendSuccess(res, { data: { application } });
}

export async function photo(req, res) {
  sendImage(res, await enrollmentService.getPhoto(req.params.id));
}

export async function decideApplication(req, res) {
  const application = await enrollmentService.decideApplication(req.params.id, req.body, context(req));
  sendSuccess(res, { message: `Application ${req.body.status}`, data: { application } });
}

export async function reopenApplication(req, res) {
  const application = await enrollmentService.reopenApplication(req.params.id, context(req));
  sendSuccess(res, { message: 'Decision reopened', data: { application } });
}

export async function decide(req, res) {
  const application = await enrollmentService.decideRequest(req.params.id, req.params.requestId, req.body, context(req));
  sendSuccess(res, { message: `Request ${req.body.status}`, data: { application } });
}

export async function reopen(req, res) {
  const application = await enrollmentService.reopenRequest(req.params.id, req.params.requestId, context(req));
  sendSuccess(res, { message: 'Decision reopened', data: { application } });
}
