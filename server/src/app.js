import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isTest } from './config/environment.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import { sanitizeRequest } from './middleware/sanitize.middleware.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  if (env.trustProxy) {
    // Needed behind Render/Railway/Nginx so rate limiting sees the real client IP.
    app.set('trust proxy', env.trustProxy);
  }

  app.use(helmet());
  app.use(cors({ origin: env.clientUrls }));
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitizeRequest);
  if (!isTest) {
    app.use(morgan('dev'));
  }

  app.use('/api', apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
