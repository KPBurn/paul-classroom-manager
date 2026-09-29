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
  it('falls back to in-memory MongoDB when no URI is configured', async () => {
    process.env.MONGODB_URI = '';

    await connectDatabase(undefined);

    assert.equal(mongoose.connection.readyState, 1);
    assert.ok(mongoose.connection.name.length > 0);
  });
});
