import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

let memoryServer;

export async function connectDatabase(uri) {
  const connectionUri = uri ?? process.env.MONGODB_URI;

  try {
    await mongoose.connect(connectionUri, { serverSelectionTimeoutMS: 10_000 });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return null;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri(), { serverSelectionTimeoutMS: 10_000 });
    console.log(`MongoDB connected (in-memory fallback): ${mongoose.connection.host}/${mongoose.connection.name}`);
    return memoryServer;
  }
}

export async function disconnectDatabase() {
  if (memoryServer) {
    await mongoose.disconnect();
    await memoryServer.stop();
    memoryServer = null;
    return;
  }

  await mongoose.disconnect();
}
