import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    weekdays: { type: [Number], required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false },
);

const classroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // What the class teaches, such as "English". Applicants see classes grouped by it.
    subject: { type: String, trim: true, maxlength: 80, default: '' },
    // The weekly class time, chosen from the teacher's availability. Empty until it is decided.
    schedule: { type: scheduleSchema, default: null },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    openAccess: { type: Boolean, default: false, required: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
    // Held for a moment while a teacher starts a class now, so two requests cannot both create one.
    sessionStartLockedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.archived = ret.status === 'archived';
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

classroomSchema.index({ status: 1, name: 1 });
classroomSchema.index({ teacher: 1, status: 1 });
classroomSchema.index({ teachers: 1, status: 1 });
classroomSchema.index({ students: 1, status: 1 });

export const Classroom = mongoose.model('Classroom', classroomSchema);
