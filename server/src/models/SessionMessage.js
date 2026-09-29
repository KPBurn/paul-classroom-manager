import mongoose from 'mongoose';

const sessionMessageSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

sessionMessageSchema.index({ session: 1, createdAt: -1 });

export const SessionMessage = mongoose.model('SessionMessage', sessionMessageSchema);
