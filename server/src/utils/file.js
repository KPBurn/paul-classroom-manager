import { AppError } from './AppError.js';

export const MAX_UPLOAD_FILE_SIZE = 8 * 1024 * 1024;

export function getSafeFileName(header) {
  if (typeof header !== 'string' || header.length > 600) {
    throw new AppError(400, 'A valid file name is required');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(header);
  } catch {
    throw new AppError(400, 'A valid file name is required');
  }
  const name = decoded.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name.length > 180) throw new AppError(400, 'File name must be between 1 and 180 characters');
  return name;
}
