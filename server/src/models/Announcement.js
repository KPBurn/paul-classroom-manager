import mongoose from 'mongoose';

export const ANNOUNCEMENT_LIMITS = {
  title: 120,
  body: 2000,
  type: 30,
};

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: ANNOUNCEMENT_LIMITS.title },
    body: { type: String, required: true, trim: true, maxlength: ANNOUNCEMENT_LIMITS.body },
    type: { type: String, required: true, trim: true, maxlength: ANNOUNCEMENT_LIMITS.type },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // School-wide announcements have no classroom; classroom announcements are shown to that class.
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', default: null },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
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

announcementSchema.index({ status: 1, createdAt: -1 });
announcementSchema.index({ classroom: 1, status: 1, createdAt: -1 });

export const Announcement = mongoose.model('Announcement', announcementSchema);
