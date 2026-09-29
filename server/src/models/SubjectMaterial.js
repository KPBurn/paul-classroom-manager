import mongoose from 'mongoose';

const subjectMaterialSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 180 },
    // Optional label and note shown with the attachment; the file name is used when there is no title.
    title: { type: String, trim: true, maxlength: 180, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    contentType: { type: String, maxlength: 120, default: 'application/octet-stream' },
    size: { type: Number, required: true, min: 1 },
    data: { type: Buffer, required: true, select: false },
    availableAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

subjectMaterialSchema.index({ subject: 1, availableAt: 1, createdAt: -1 });

export const SubjectMaterial = mongoose.model('SubjectMaterial', subjectMaterialSchema);
