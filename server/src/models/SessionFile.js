import mongoose from 'mongoose';

const sessionFileSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 180 },
    size: { type: Number, required: true, min: 1 },
    data: { type: Buffer, required: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionFileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionFileSchema.index({ session: 1, createdAt: -1 });

export const SessionFile = mongoose.model('SessionFile', sessionFileSchema);
