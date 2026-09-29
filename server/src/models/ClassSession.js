import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['present', 'late', 'absent'], required: true },
    checkInAt: { type: Date },
  },
  { _id: false },
);

const classSessionSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    attendanceConditionEnabled: { type: Boolean, default: true, required: true },
    screenSharingEnabled: { type: Boolean, default: true, required: true },
    fileUploadsEnabled: { type: Boolean, default: true, required: true },
    seriesId: { type: String, default: null, index: true },
    timezone: { type: String, default: 'UTC' },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled', required: true },
    attendance: { type: [attendanceSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

classSessionSchema.index({ classroom: 1, startsAt: 1 });
classSessionSchema.index({ startsAt: 1, endsAt: 1, status: 1 });
classSessionSchema.index({ classroom: 1, seriesId: 1 });

export const ClassSession = mongoose.model('ClassSession', classSessionSchema);
