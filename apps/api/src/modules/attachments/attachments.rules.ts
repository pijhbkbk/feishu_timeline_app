import { AttachmentTargetType } from '@prisma/client';

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const;

export const ATTACHMENT_MANAGEMENT_ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
  'quality_engineer',
  'purchaser',
  'reviewer',
  'finance',
] as const;

export const ATTACHMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export function getAttachmentFileValidationIssue(input: {
  mimeType: string;
  fileSize: number;
}) {
  if (!ATTACHMENT_ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
    return '当前文件类型不在系统允许范围内。';
  }

  if (input.fileSize <= 0 || input.fileSize > ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return '文件大小超出系统限制。';
  }

  return null;
}

export function canPreviewAttachmentMimeType(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

export function parseAttachmentEntityType(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return AttachmentTargetType.PROJECT;
  }

  const normalized = value.trim() as AttachmentTargetType;
  const values = Object.values(AttachmentTargetType);

  if (!values.includes(normalized)) {
    return null;
  }

  return normalized;
}

export function parseBooleanFlag(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  return value === 'true' || value === '1';
}
