import mongoose from 'mongoose';

const classroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
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
classroomSchema.index({ students: 1, status: 1 });

export const Classroom = mongoose.model('Classroom', classroomSchema);
