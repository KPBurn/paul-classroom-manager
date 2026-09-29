import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

process.env.NODE_ENV = 'test';

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
  }
});

describe('database startup', () => {
  it('requires a configured MongoDB URI', async () => {
    process.env.MONGODB_URI = '';

    await assert.rejects(connectDatabase(undefined), /MONGODB_URI must be configured/);
    assert.equal(mongoose.connection.readyState, 0);
  });
});
