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
