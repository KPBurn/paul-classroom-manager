import mongoose from 'mongoose';

export const FEEDBACK_LIMITS = {
  book: 200,
  shortText: 200,
  longText: 3000,
};

const rating = { type: Number, min: 1, max: 5, default: null };
const longText = { type: String, trim: true, maxlength: FEEDBACK_LIMITS.longText, default: '' };
const shortText = { type: String, trim: true, maxlength: FEEDBACK_LIMITS.shortText, default: '' };

/**
 * A teacher's written feedback for one student after one lesson (class
 * session). Class, lesson, date and time come from the session itself.
 */
const teacherFeedbackSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
    // Copied from the session so history can be filtered and sorted without joins.
    lessonAt: { type: Date, required: true },
    book: { type: String, trim: true, maxlength: FEEDBACK_LIMITS.book, default: '' },
    whatWeLearned: longText,
    vocabulary: {
      newWords: longText,
      independentWords: longText,
    },
    grammar: {
      topic: shortText,
      understanding: longText,
      accuracy: longText,
    },
    speaking: {
      fluency: rating,
      pronunciation: rating,
      confidence: rating,
    },
    didWell: longText,
    needsImprovement: longText,
    recommendation: longText,
    notes: longText,
    status: { type: String, enum: ['draft', 'completed'], default: 'draft', required: true },
    submittedAt: { type: Date, default: null },
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

// One feedback record per student per lesson; a student collects many across lessons.
teacherFeedbackSchema.index({ session: 1, student: 1 }, { unique: true });
teacherFeedbackSchema.index({ teacher: 1, lessonAt: -1 });
teacherFeedbackSchema.index({ student: 1, lessonAt: -1 });
teacherFeedbackSchema.index({ classroom: 1, lessonAt: -1 });

export const TeacherFeedback = mongoose.model('TeacherFeedback', teacherFeedbackSchema);
