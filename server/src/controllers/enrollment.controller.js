import * as enrollmentService from '../services/enrollment.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const context = (req) => ({ actor: req.user, ipAddress: req.ip });

export async function classes(_req, res) {
  const items = await enrollmentService.listOpenClasses();
  sendSuccess(res, { data: { items } });
}

export async function submit(req, res) {
  const application = await enrollmentService.submitApplication(req.body, context(req));
  sendSuccess(res, { status: 201, message: 'Application submitted', data: { application } });
}

export async function uploadPhoto(req, res) {
  await enrollmentService.attachPhoto(req.params.referenceNumber, req.body);
  sendSuccess(res, { status: 201, message: 'Photo added to your application' });
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

export async function list(req, res) {
  const data = await enrollmentService.listApplications(req.validatedQuery);
  sendSuccess(res, { data });
}

export async function show(req, res) {
  const application = await enrollmentService.getApplication(req.params.id);
  sendSuccess(res, { data: { application } });
}

export async function photo(req, res) {
  const image = await enrollmentService.getPhoto(req.params.id);
  res.set({
    'Content-Type': image.contentType,
    'Content-Length': String(image.data.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(image.data);
}

export async function decideApplication(req, res) {
  const application = await enrollmentService.decideApplication(req.params.id, req.body, context(req));
  sendSuccess(res, { message: `Application ${req.body.status}`, data: { application } });
}

export async function decide(req, res) {
  const application = await enrollmentService.decideRequest(req.params.id, req.params.requestId, req.body, context(req));
  sendSuccess(res, { message: `Request ${req.body.status}`, data: { application } });
}
