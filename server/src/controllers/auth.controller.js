import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function login(req, res) {
  const data = await authService.login(req.body, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Login successful', data });
}

export async function roleTestingStatus(_req, res) {
  const data = await authService.getRoleTestingStatus();
  sendSuccess(res, { data });
}

export async function loginWithTestRole(req, res) {
  const data = await authService.loginWithTestRole(req.body.role, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Temporary role test login successful', data });
}

export async function register(req, res) {
  const user = await authService.register(req.body, { actor: req.user, ipAddress: req.ip });
  sendSuccess(res, { status: 201, message: 'User created successfully', data: { user } });
}

export async function changePassword(req, res) {
  const data = await authService.changeOwnPassword(req.user._id, req.body, {
    roleTestSession: req.roleTestSession,
    ipAddress: req.ip,
  });
  sendSuccess(res, { message: 'Password changed. Other devices have been signed out.', data });
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.body.email, { ipAddress: req.ip });
  // The same answer for every email, so this cannot be used to find out who has an account.
  sendSuccess(res, { message: 'If that email has an account, a reset link is on its way.' });
}

export async function resetPassword(req, res) {
  await authService.resetPasswordWithToken(req.body, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Password changed. Sign in with your new password.' });
}

export async function setAvailability(req, res) {
  const user = await authService.setOwnAvailability(req.user, req.body.availability, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Availability saved', data: { user } });
}

export function me(req, res) {
  sendSuccess(res, { data: { user: authService.toAuthUser(req.user) } });
}

/**
 * JWTs are stateless, so the client discards its token. The server records the
 * sign-out; deactivating an account revokes its tokens on the next request.
 */
export async function logout(req, res) {
  await authService.logout(req.user, { ipAddress: req.ip });
  sendSuccess(res, { message: 'Logged out successfully' });
}
