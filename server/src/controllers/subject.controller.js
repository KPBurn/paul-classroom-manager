import * as subjectService from '../services/subject.service.js';
import { AppError } from '../utils/AppError.js';
import { MAX_UPLOAD_FILE_SIZE, getSafeFileName } from '../utils/file.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function list(req, res) {
  const data = await subjectService.listSubjects(req.user);
  sendSuccess(res, { data });
}

export async function create(req, res) {
  const subject = await subjectService.createSubject(req.body, {
    actor: req.user,
    ipAddress: req.ip,
  });
  sendSuccess(res, { status: 201, message: 'Subject created successfully', data: { subject } });
}

export async function get(req, res) {
  const subject = await subjectService.getSubject(req.params.id, req.user);
  sendSuccess(res, { data: { subject } });
}

export async function uploadMaterial(req, res) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'Choose a file to upload');
  }
  if (req.body.length > MAX_UPLOAD_FILE_SIZE) {
    throw new AppError(413, 'Files must be 8 MB or smaller');
  }

  const releaseHeader = req.get('x-available-at');
  let availableAt;
  if (releaseHeader !== undefined) {
    if (!releaseHeader || releaseHeader.length > 40 || !Number.isFinite(Date.parse(releaseHeader))) {
      throw new AppError(400, 'Enter a valid material availability date');
    }
    availableAt = new Date(releaseHeader);
  }

  const material = await subjectService.createSubjectMaterial(
    req.params.id,
    { name: getSafeFileName(req.get('x-file-name')), data: req.body, availableAt },
    req.user,
  );
  sendSuccess(res, { status: 201, message: 'Material uploaded successfully', data: { material } });
}

export async function downloadMaterial(req, res) {
  const material = await subjectService.getSubjectMaterial(req.params.id, req.params.materialId, req.user);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(material.data.length),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(material.name)}`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(material.data);
}
