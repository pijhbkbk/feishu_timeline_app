import { AttachmentTargetType } from '@prisma/client';
import { extname } from 'node:path';

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const ATTACHMENT_ALLOWED_FILE_TYPES = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
} as const satisfies Record<string, readonly (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number][]>;

const PREVIEWABLE_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_ATTACHMENT_FILE_NAME_LENGTH = 180;

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
  originalName: string;
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
}) {
  const fileNameIssue = getAttachmentFileNameIssue(input.originalName);

  if (fileNameIssue) {
    return fileNameIssue;
  }

  const extension = extname(input.originalName).toLowerCase();
  const allowedMimeTypes =
    ATTACHMENT_ALLOWED_FILE_TYPES[extension as keyof typeof ATTACHMENT_ALLOWED_FILE_TYPES];

  if (!allowedMimeTypes) {
    return '当前文件扩展名不在系统允许范围内。';
  }

  if (!ATTACHMENT_ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
    return '当前文件类型不在系统允许范围内。';
  }

  if (!(allowedMimeTypes as readonly string[]).includes(input.mimeType)) {
    return '文件扩展名与文件类型不匹配。';
  }

  if (input.fileSize <= 0 || input.fileSize > ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return '文件大小超出系统限制。';
  }

  if (!matchesAllowedFileSignature(extension, input.buffer)) {
    return '文件内容与允许的文件类型不匹配。';
  }

  return null;
}

export function canPreviewAttachmentMimeType(mimeType: string) {
  return PREVIEWABLE_ATTACHMENT_MIME_TYPES.includes(mimeType);
}

function getAttachmentFileNameIssue(originalName: string) {
  const trimmed = originalName.trim();

  if (!trimmed || trimmed.length > MAX_ATTACHMENT_FILE_NAME_LENGTH || hasControlCharacter(trimmed)) {
    return '附件文件名无效。';
  }

  const namesToCheck = new Set([trimmed]);

  try {
    namesToCheck.add(decodeURIComponent(trimmed));
  } catch {
    return '附件文件名无效。';
  }

  for (const name of namesToCheck) {
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return '附件文件名不能包含路径或上级目录标记。';
    }
  }

  return null;
}

function matchesAllowedFileSignature(extension: string, buffer: Buffer) {
  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (extension === '.png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (extension === '.pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  if (extension === '.docx') {
    return isZipBuffer(buffer) && buffer.includes(Buffer.from('[Content_Types].xml')) && buffer.includes(Buffer.from('word/'));
  }

  if (extension === '.xlsx') {
    return isZipBuffer(buffer) && buffer.includes(Buffer.from('[Content_Types].xml')) && buffer.includes(Buffer.from('xl/'));
  }

  return false;
}

function isZipBuffer(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) {
      return true;
    }
  }

  return false;
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
