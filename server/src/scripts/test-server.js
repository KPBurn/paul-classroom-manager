// Interactive test mode: boots the real API on an in-memory MongoDB so the app
// can be exercised locally without a reachable Atlas cluster. Data disappears
// when the process stops.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'local-test-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL ||= 'http://localhost:5173';

const { MongoMemoryServer } = await import('mongodb-memory-server');

const mongo = await MongoMemoryServer.create();
// Must be set before ../server.js is imported: environment.js reads it at load time.
process.env.MONGODB_URI = mongo.getUri();
console.log(`In-memory MongoDB ready: ${mongo.getUri()}`);

const originalShutdown = process.listeners('SIGINT');
process.removeAllListeners('SIGINT');
process.on('SIGINT', async () => {
  for (const listener of originalShutdown) listener('SIGINT');
  await mongo.stop();
});

await import('../server.js');
