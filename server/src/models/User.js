import mongoose from 'mongoose';
import { hashPassword } from '../utils/password.js';

export const USER_ROLES = ['admin', 'teacher', 'student'];
export const USER_STATUSES = ['active', 'inactive', 'suspended'];

const availabilitySlotSchema = new mongoose.Schema(
  {
    weekday: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Excluded from queries by default; request it explicitly with .select('+password').
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'teacher' },
    status: { type: String, enum: USER_STATUSES, required: true, default: 'active' },
    lastLoginAt: { type: Date },
    // The weekly times a teacher can teach. A class schedule has to fit inside them.
    availability: { type: [availabilitySlotSchema], default: [] },
    // Part of every JWT. Bumping it signs the user out everywhere (e.g. after a password reset).
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ lastName: 1, firstName: 1 });

userSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.pre('save', async function hashPasswordOnChange() {
  if (this.isModified('password')) {
    this.password = await hashPassword(this.password);
  }
});

export const User = mongoose.model('User', userSchema);
