import { Router } from 'express';
import mongoose from 'mongoose';
import { announceChanges } from '../middleware/live.middleware.js';
import { DATA_RESOURCES as LIVE } from '../realtime/dataEvents.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import announcementRoutes from './announcement.routes.js';
import authRoutes from './auth.routes.js';
import classroomRoutes from './classroom.routes.js';
import enrollmentRoutes from './enrollment.routes.js';
import feedbackRoutes from './feedback.routes.js';
import sessionRoutes from './session.routes.js';
import systemSettingsRoutes from './systemSettings.routes.js';
import subjectRoutes from './subject.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, {
    message: 'Classroom Manager API. The web app runs separately (http://localhost:5173 in development).',
    data: { health: '/api/health' },
  });
});

router.get('/health', (_req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return next(new AppError(503, 'Database is unavailable'));
  }

  sendSuccess(res, {
    message: 'API is running',
    data: { database: 'connected' },
  });
});

// A change made through these routes is announced to connected pages, so their lists stay current.
const staff = { roles: ['admin', 'teacher'] };
router.use('/auth', authRoutes);
router.use('/announcements', announceChanges(LIVE.announcements), announcementRoutes);
router.use('/classrooms', announceChanges([LIVE.classrooms, LIVE.announcements]), classroomRoutes);
// Enrollment tells the people concerned itself: most of its requests are public.
router.use('/enrollment', enrollmentRoutes);
router.use('/feedback', announceChanges(LIVE.feedback, staff), feedbackRoutes);
router.use('/subjects', announceChanges(LIVE.materials), subjectRoutes);
router.use('/sessions', sessionRoutes);
router.use('/system-settings', systemSettingsRoutes);
// Changing a role or status can take someone out of their classrooms.
router.use('/users', announceChanges(LIVE.users, { roles: ['admin'] }), announceChanges(LIVE.classrooms), userRoutes);

export default router;
