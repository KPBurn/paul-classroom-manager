/**
 * Creates the first administrator (and optionally a demo teacher) so there is
 * someone who can sign in. Existing accounts are left untouched.
 *
 *   npm run seed
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { assertRequiredEnv, env } from '../config/environment.js';
import { User } from '../models/User.js';
import { seedAccount } from '../services/seedAccount.service.js';

const accounts = [
  {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    firstName: 'System',
    lastName: 'Administrator',
    role: 'admin',
    required: true,
  },
  {
    email: process.env.SEED_TEACHER_EMAIL,
    password: process.env.SEED_TEACHER_PASSWORD,
    firstName: 'Demo',
    lastName: 'Teacher',
    role: 'teacher',
    required: false,
  },
];

async function seed() {
  assertRequiredEnv();
  await connectDatabase(env.mongodbUri);
  await User.init(); // ensure the unique email index exists

  try {
    for (const account of accounts) {
      await seedAccount(account);
    }
  } finally {
    await disconnectDatabase();
  }
}

seed().catch((err) => {
  console.error(`Seeding failed: ${err.message}`);
  process.exit(1);
});
