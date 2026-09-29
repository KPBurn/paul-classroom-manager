import { User } from '../models/User.js';
import { passwordSchema } from '../validators/auth.validators.js';

export async function seedAccount({ email, password, firstName, lastName, role, required }) {
  const label = `${role} account`;

  if (!email || !password) {
    if (required) {
      throw new Error(`SEED_${role.toUpperCase()}_EMAIL and SEED_${role.toUpperCase()}_PASSWORD must be set`);
    }
    console.log(`Skipping ${label}: no credentials configured`);
    return;
  }

  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    throw new Error(`SEED_${role.toUpperCase()}_PASSWORD: ${passwordCheck.error.issues[0].message}`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) {
    console.log(`Skipping ${label}: ${normalizedEmail} already exists`);
    return;
  }

  await User.create({ email: normalizedEmail, password, firstName, lastName, role, status: 'active' });
  console.log(`Created ${label}: ${normalizedEmail}`);
}
