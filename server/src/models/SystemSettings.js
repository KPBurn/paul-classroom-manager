import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'system' },
    roleTestingEnabled: { type: Boolean, default: false },
    // What every class pays a teacher who is present for its whole duration.
    defaultSessionRate: { type: Number, default: 100, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
