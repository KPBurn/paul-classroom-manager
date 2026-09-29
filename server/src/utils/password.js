import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = (plainText) => bcrypt.hash(plainText, SALT_ROUNDS);

export const comparePassword = (plainText, hash) => bcrypt.compare(plainText, hash);
