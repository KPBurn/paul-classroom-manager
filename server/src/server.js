import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { assertRequiredEnv, env } from './config/environment.js';
import { attachSessionSocket } from './realtime/sessionSocket.js';

async function start() {
  assertRequiredEnv();
  await connectDatabase(env.mongodbUri);

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
