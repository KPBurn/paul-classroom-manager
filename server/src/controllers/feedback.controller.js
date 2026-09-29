import * as feedbackService from '../services/feedback.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const context = (req) => ({ actor: req.user, ipAddress: req.ip });

export async function list(req, res) {
  const data = await feedbackService.listFeedback(req.validatedQuery, req.user);
  sendSuccess(res, { data });
}

export async function lessonRoster(req, res) {
  const data = await feedbackService.getLessonRoster(req.params.sessionId, req.user);
  sendSuccess(res, { data });
}

export async function show(req, res) {
  const feedback = await feedbackService.getFeedback(req.params.id, req.user);
  sendSuccess(res, { data: { feedback } });
}

export async function create(req, res) {
  const feedback = await feedbackService.createFeedback(req.body, context(req));
  sendSuccess(res, {
    status: 201,
    message: feedback.status === 'completed' ? 'Feedback submitted' : 'Draft saved',
    data: { feedback },
  });
}

export async function update(req, res) {
  const feedback = await feedbackService.updateFeedback(req.params.id, req.body, context(req));
  sendSuccess(res, {
    message: feedback.status === 'completed' ? 'Feedback saved' : 'Draft saved',
    data: { feedback },
  });
}
