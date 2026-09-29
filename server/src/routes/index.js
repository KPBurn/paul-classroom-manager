import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../utils/apiResponse.js';
import announcementRoutes from './announcement.routes.js';
import authRoutes from './auth.routes.js';
import classroomRoutes from './classroom.routes.js';
import sessionRoutes from './session.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, {
    message: 'Classroom Manager API. The web app runs separately (http://localhost:5173 in development).',
    data: { health: '/api/health' },
  });
});

router.get('/health', (_req, res) => {
  sendSuccess(res, {
    message: 'API is running',
    data: { database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' },
  });
});

router.use('/auth', authRoutes);
router.use('/announcements', announcementRoutes);
router.use('/classrooms', classroomRoutes);
router.use('/sessions', sessionRoutes);
router.use('/users', userRoutes);

export default router;
