// Interactive test mode: boots the real API on an in-memory MongoDB so the app
// can be exercised locally without a reachable Atlas cluster. Data disappears
// when the process stops. Started with `npm run test:server`.
//
// Note: the file must NOT be named `test-*.js` (or `*.test.js`) — Node's default
// `node --test` discovery would run it as a test file and hang the suite waiting
// for this server to exit.
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
