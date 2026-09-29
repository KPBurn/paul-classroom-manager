import { AppError } from './AppError.js';

export const MAX_UPLOAD_FILE_SIZE = 8 * 1024 * 1024;

/**
 * Types served back with their own Content-Type so browsers can preview them.
 * Anything else (including SVG and HTML, which can run scripts) is served as
 * a plain download.
 */
export const PREVIEWABLE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/** A well-formed MIME type from an upload header, or the generic binary type. */
export function getSafeContentType(header) {
  const value = typeof header === 'string' ? header.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,60}$/.test(value)
    ? value
    : 'application/octet-stream';
}

/** Decodes an optional URI-encoded text header, trimmed and limited to `maxLength`. */
export function getOptionalTextHeader(header, label, maxLength) {
  if (header === undefined || header === '') return '';
  let decoded;
  try {
    decoded = decodeURIComponent(header).trim();
  } catch {
    throw new AppError(400, `Enter a valid ${label}`);
  }
  if (decoded.length > maxLength) throw new AppError(400, `The ${label} must be at most ${maxLength} characters`);
  return decoded;
}

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
