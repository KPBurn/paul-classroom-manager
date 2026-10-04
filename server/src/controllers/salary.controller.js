import * as salaryService from '../services/salary.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function summary(req, res) {
  const data = await salaryService.getSalarySummary(req.user, req.validatedQuery);
  sendSuccess(res, { data });
}

export async function teachers(req, res) {
  const data = await salaryService.listTeacherSalaries(req.user, req.validatedQuery);
  sendSuccess(res, { data });
}

export async function withdrawals(req, res) {
  const data = await salaryService.listWithdrawals(req.user, req.validatedQuery);
  sendSuccess(res, { data });
}

export async function requestWithdrawal(req, res) {
  const data = await salaryService.createWithdrawal(req.user, req.body, { ipAddress: req.ip });
  sendSuccess(res, { status: 201, message: 'Withdrawal requested', data: { withdrawal: data } });
}

export async function reviewWithdrawal(req, res) {
  const data = await salaryService.reviewWithdrawal(req.user, req.params.id, req.body, { ipAddress: req.ip });
  sendSuccess(res, { message: `Withdrawal ${data.status}`, data: { withdrawal: data } });
}

export async function cancelWithdrawal(req, res) {
  await salaryService.cancelWithdrawal(req.user, req.params.id, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Withdrawal cancelled' });
}