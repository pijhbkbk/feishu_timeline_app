'use client';
import { API_BASE_URL } from '../../lib/auth-client';
import { ThumbnailCache } from './thumbnail-cache';
const MAX_THUMBNAIL_BYTES = 512 * 1024;

export const sheetThumbnails = new ThumbnailCache(async (id, signal) => {
  const response = await fetch(`${API_BASE_URL}/sheet-images/${encodeURIComponent(id)}/thumbnail`, { credentials: 'include', cache: 'no-store', signal });
  if (!response.ok) throw new Error(`缩略图读取失败（${response.status}），请稍后手动重试。`);
  const mime = response.headers.get('content-type')?.split(';')[0];
  if (!mime || !['image/webp'].includes(mime) || Number(response.headers.get('content-length')) > MAX_THUMBNAIL_BYTES || !response.body) {
    await response.body?.cancel(); throw new Error('缩略图格式或大小无效。');
  }
  const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_THUMBNAIL_BYTES) { await reader.cancel(); throw new Error('缩略图超过大小限制。'); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  if (!total) throw new Error('缩略图为空。');
  const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
  return { url, release: () => URL.revokeObjectURL(url) };
});
