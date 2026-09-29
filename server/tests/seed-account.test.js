import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedAccount } from '../src/services/seedAccount.service.js';

describe('seedAccount', () => {
  it('skips optional accounts when no credentials are configured', async () => {
    await assert.doesNotReject(
      seedAccount({
        firstName: 'Demo',
        lastName: 'Teacher',
        role: 'teacher',
        required: false,
      }),
    );
  });

  it('rejects partially configured credentials', async () => {
    await assert.rejects(
      seedAccount({
        email: 'teacher@example.com',
        firstName: 'Demo',
        lastName: 'Teacher',
        role: 'teacher',
        required: false,
      }),
      /SEED_TEACHER_EMAIL and SEED_TEACHER_PASSWORD must both be set/,
    );
  });
});
