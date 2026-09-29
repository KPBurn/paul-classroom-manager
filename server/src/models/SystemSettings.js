import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'system' },
    roleTestingEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
