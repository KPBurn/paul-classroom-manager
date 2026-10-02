import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri) {
  const connectionUri = uri ?? process.env.MONGODB_URI;
  if (!connectionUri) {
    throw new Error('MONGODB_URI must be configured');
  }

  await mongoose.connect(connectionUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/**
 * MongoDB answers a query with its first 101 documents and sends the rest only
 * when asked again, which costs a second trip to the database. Reads that
 * return a whole list ask for this many at once instead.
 */
export const LIST_BATCH_SIZE = 1000;
