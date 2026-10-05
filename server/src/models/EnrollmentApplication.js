import mongoose from 'mongoose';

export const ENROLLMENT_STATUSES = ['pending', 'approved', 'rejected'];
export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

/** One class the student asked for. The administrator decides each one, and may move it to another class. */
const classRequestSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  status: { type: String, enum: ENROLLMENT_STATUSES, default: 'pending', required: true },
  decidedAt: { type: Date },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

/**
 * A request to join one or more classes. An `applicant` has no account yet and
 * filled in the public form; a `student` already has one and only names the
 * classes. Records that belong to the application later on (such as uploaded
 * documents) can refer to it by id without changing this model.
 */
const enrollmentApplicationSchema = new mongoose.Schema(
  {
    referenceNumber: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['applicant', 'student'], required: true },
    student: {
      firstName: { type: String, required: true, trim: true, maxlength: 50 },
      middleName: { type: String, trim: true, maxlength: 50, default: '' },
      lastName: { type: String, required: true, trim: true, maxlength: 50 },
      email: { type: String, required: true, lowercase: true, trim: true },
      // A calendar date ("YYYY-MM-DD"), so it reads the same in every timezone. Age is worked out from it.
      birthday: { type: String, default: '' },
      gender: { type: String, enum: [...GENDERS, ''], default: '' },
      address: { type: String, trim: true, maxlength: 300, default: '' },
      contactNumber: { type: String, trim: true, maxlength: 20, default: '' },
    },
    guardian: {
      name: { type: String, trim: true, maxlength: 100, default: '' },
      relationship: { type: String, trim: true, maxlength: 50, default: '' },
      contactNumber: { type: String, trim: true, maxlength: 20, default: '' },
      email: { type: String, lowercase: true, trim: true, default: '' },
    },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    // The optional 2x2 photo. The image itself is only loaded when it is asked for.
    photo: {
      data: { type: Buffer, select: false },
      contentType: { type: String },
      size: { type: Number },
    },
    // May be empty: an applicant can be approved first and choose classes from their account.
    requests: { type: [classRequestSchema], default: [] },
    // With classes: pending while any is undecided, then approved if at least one was. Without: decided as a whole.
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'pending', required: true },
    // What the administrator tells the student about the decision.
    adminNote: { type: String, trim: true, maxlength: 500, default: '' },
    // The student's account: set from the start for a `student`, and for an `applicant` once they have one.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    agreedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.hasPhoto = Boolean(ret.photo?.size);
        delete ret.photo;
        delete ret._id;
        delete ret.__v;
        for (const request of ret.requests ?? []) {
          request.id = String(request._id);
          delete request._id;
        }
        return ret;
      },
    },
  },
);

enrollmentApplicationSchema.index({ status: 1, createdAt: -1 });
enrollmentApplicationSchema.index({ 'student.email': 1 });
enrollmentApplicationSchema.index({ user: 1, createdAt: -1 });
enrollmentApplicationSchema.index({ 'requests.classroom': 1 });

export const EnrollmentApplication = mongoose.model('EnrollmentApplication', enrollmentApplicationSchema);
