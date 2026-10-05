import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { assertRequiredEnv, env } from './config/environment.js';
import { attachSessionSocket } from './realtime/sessionSocket.js';
import { purgeExpiredApplications } from './services/enrollment.service.js';
import { closeInterruptedAttendance } from './services/session.service.js';

async function start() {
  assertRequiredEnv();
  await connectDatabase(env.mongodbUri);
  // Attendance left running by the last shutdown stops here; see closeInterruptedAttendance.
  await closeInterruptedAttendance();

  // Applications that were not approved are removed once they pass the retention period, if one is set.
  const purge = () => purgeExpiredApplications().catch((error) => console.error('Unable to remove old enrollment applications', error));
  await purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();

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
