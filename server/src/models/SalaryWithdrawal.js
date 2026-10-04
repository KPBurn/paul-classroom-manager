import mongoose from 'mongoose';

export const WITHDRAWAL_STATUSES = ['pending', 'approved', 'rejected'];
export const WITHDRAWAL_METHODS = ['cash', 'bank-transfer', 'other'];

/** A teacher's request to take out earnings. Administrators approve or reject it. */
const salaryWithdrawalSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: WITHDRAWAL_METHODS, default: 'cash', required: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: 'pending', required: true },
    requestedAt: { type: Date, default: Date.now, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 200 },
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

salaryWithdrawalSchema.index({ teacher: 1, status: 1, requestedAt: -1 });
salaryWithdrawalSchema.index({ status: 1, requestedAt: -1 });

export const SalaryWithdrawal = mongoose.model('SalaryWithdrawal', salaryWithdrawalSchema);