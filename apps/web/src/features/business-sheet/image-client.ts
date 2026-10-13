'use client';
import { API_BASE_URL, apiRequest, ApiRequestError, normalizeApiErrorMessage } from '../../lib/auth-client';
export type SheetImageTarget = 'SHEET_COLOR' | 'SHEET_PERSON' | 'SHEET_INSPECTION' | 'SHEET_PRODUCTION';
export interface ImageLayout { fieldKey: string; mode: 'CELL' | 'FLOATING'; offsetX: number; offsetY: number; width: number; height: number }
export interface SheetImage extends ImageLayout { id: string; attachmentId: string; targetType: SheetImageTarget; recordId: string; revision: number; isDeleted: boolean; thumbnailUrl: string; contentUrl: string }
export const defaultImageLayout = (fieldKey = 'photos'): ImageLayout => ({ fieldKey, mode: 'CELL', offsetX: 4, offsetY: 4, width: 112, height: 72 });
export async function listSheetImages(targetType: SheetImageTarget, ids: readonly string[], signal?: AbortSignal) {
  const items: SheetImage[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    let after = '';
    do {
      const query = new URLSearchParams({ targetType, recordIds: ids.slice(offset, offset + 100).join(','), take: '100' });
      if (after) query.set('after', after);
      const result = await apiRequest<{ items: SheetImage[]; nextCursor: string | null }>(`/sheet-images?${query}`, { ...(signal ? { signal } : {}) });
      items.push(...result.items); after = result.nextCursor ?? '';
      if (items.length > 5000) throw new Error('图片超过本次视图上限，请缩小筛选范围。');
    } while (after);
  }
  return items;
}
export function uploadSheetImage(file: File, targetType: SheetImageTarget, recordId: string, layout: ImageLayout, operationId: string, onProgress: (value: number) => void): Promise<SheetImage> {
  const body = new FormData(); body.set('file', file); body.set('targetType', targetType); body.set('recordId', recordId); body.set('layout', JSON.stringify(layout)); body.set('operationId', operationId);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', `${API_BASE_URL}/sheet-images`); xhr.withCredentials = true; xhr.timeout = 120000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error('图片上传连接中断；请重试核实原请求。'));
    xhr.ontimeout = () => reject(new Error('图片处理超时；请重试核实原请求。'));
    xhr.onload = () => {
      let data: { image?: SheetImage; message?: string };
      try { data = JSON.parse(xhr.responseText) as typeof data; } catch { reject(new Error('图片服务响应无法读取；请重试核实原请求。')); return; }
      if (xhr.status >= 200 && xhr.status < 300 && data.image) resolve(data.image);
      else reject(new ApiRequestError(normalizeApiErrorMessage(data.message, xhr.status), xhr.status));
    };
    xhr.send(body);
  });
}
export async function updateImageLayout(image: SheetImage, layout: ImageLayout, operationId: string) {
  const result = await apiRequest<{ image: SheetImage }>(`/sheet-images/${image.id}/layout`, { method: 'PATCH', body: { operationId, expectedRevision: image.revision, layout } }); return result.image;
}
export async function deleteSheetImage(image: SheetImage, operationId: string) {
  const result = await apiRequest<{ image: SheetImage }>(`/sheet-images/${image.id}`, { method: 'DELETE', body: { operationId, expectedRevision: image.revision } }); return result.image;
}
export async function imageBytes(image: SheetImage, signal?: AbortSignal) {
  let response: Response;
  // Export/import verification can read more originals than the ordinary
  // attachment budget allows in one minute. Honor the server's explicit wait;
  // never widen that budget or retry an authorization/error response blindly.
  for (let attempt = 0; ; attempt++) {
    response = await fetch(`${API_BASE_URL}${image.contentUrl}`, { credentials: 'include', cache: 'no-store', ...(signal ? { signal } : {}) });
    const after = response.headers.get('retry-after');
    const seconds = after !== null && /^\d+$/.test(after) ? Number(after) : NaN;
    if (response.status !== 429 || attempt >= 2 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) break;
    await response.body?.cancel();
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, seconds * 1000 + 100);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  if (!response.ok) throw new ApiRequestError('图片原件读取失败，请检查访问权限或重新登录。', response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new Error('图片超过导出限制。');
  return { bytes, mime: response.headers.get('content-type')?.split(';')[0] ?? '' };
}
