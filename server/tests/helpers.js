// Imported first by every test file so these values exist before app modules load.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';
process.env.JWT_EXPIRES_IN = '1h';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { User } = await import('../src/models/User.js');

export const TEST_PASSWORD = 'Password123';

let mongoServer;

export async function startDatabase() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await User.init();
}

export async function stopDatabase() {
  await mongoose.disconnect();
  await mongoServer?.stop();
}

export async function clearDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

let userCounter = 0;

export function createUser(overrides = {}) {
  userCounter += 1;
  return User.create({
    firstName: 'Test',
    lastName: `User${userCounter}`,
    email: `user${userCounter}@example.com`,
    password: TEST_PASSWORD,
    role: 'teacher',
    status: 'active',
    ...overrides,
  });
}
