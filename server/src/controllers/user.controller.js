import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

const context = (req) => ({ actor: req.user, ipAddress: req.ip });

export async function list(req, res) {
  const data = await userService.listUsers(req.validatedQuery);
  sendSuccess(res, { data });
}

export async function show(req, res) {
  const user = await userService.getUser(req.params.id);
  sendSuccess(res, { data: { user } });
}

export async function create(req, res) {
  const user = await userService.createUser(req.body, context(req));
  sendSuccess(res, { status: 201, message: 'User created successfully', data: { user } });
}

export async function update(req, res) {
  const user = await userService.updateUser(req.params.id, req.body, context(req));
  sendSuccess(res, { message: 'User updated successfully', data: { user } });
}

export async function resetPassword(req, res) {
  await userService.resetPassword(req.params.id, req.body, context(req));
  sendSuccess(res, { message: 'Password reset. The user has been signed out of all sessions.' });
}

export async function remove(req, res) {
  await userService.deleteUser(req.params.id, context(req));
  sendSuccess(res, { message: 'User deleted successfully' });
}
