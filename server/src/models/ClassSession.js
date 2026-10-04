import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['teacher', 'student'] },
    status: { type: String, enum: ['present', 'late', 'absent'], required: true },
    checkInAt: { type: Date },
    leftAt: { type: Date },
    activeSince: { type: Date },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false },
);

const classSessionSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    assignedTeachers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: undefined },
    assignedStudents: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: undefined },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // What this class pays its teachers for the whole session; taken from the school
    // default when it is scheduled. `null` means "pay whatever the default is now".
    rate: { type: Number, default: null, min: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    attendanceConditionEnabled: { type: Boolean, default: true, required: true },
    screenSharingEnabled: { type: Boolean, default: true, required: true },
    fileUploadsEnabled: { type: Boolean, default: true, required: true },
    // Set when a teacher ends the class for everyone; only teachers can enter until it is reopened.
    endedAt: { type: Date, default: null },
    // People a teacher removed from the room; they cannot rejoin this session unless allowed back.
    removedParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
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
classSessionSchema.index({ assignedTeachers: 1, startsAt: 1 });
classSessionSchema.index({ assignedStudents: 1, startsAt: 1 });
classSessionSchema.index({ startsAt: 1, endsAt: 1, status: 1 });
classSessionSchema.index({ classroom: 1, seriesId: 1 });

export const ClassSession = mongoose.model('ClassSession', classSessionSchema);
