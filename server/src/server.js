import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { assertRequiredEnv, env } from './config/environment.js';
import { User } from './models/User.js';
import { attachSessionSocket } from './realtime/sessionSocket.js';
import { seedAccount } from './services/seedAccount.service.js';

async function start() {
  assertRequiredEnv();
  const memoryServer = await connectDatabase(env.mongodbUri);
  if (memoryServer) {
    await User.init();
    await seedAccount({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      required: true,
    });
    console.warn('Using a temporary in-memory database; all data will be lost when the server stops.');
  }

  const server = createServer(createApp());
  const io = attachSessionSocket(server);
  server.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}/api`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    io.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
