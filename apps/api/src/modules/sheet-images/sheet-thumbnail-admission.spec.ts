import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { DownloadAdmissionService } from '../../common/download-admission.service';
import { SheetThumbnailAdmissionService } from './sheet-thumbnail-admission';

function request(id: string) {
  return { authUser: { id }, params: { id: 'image-1' }, path: '/api/sheet-images/image-1/thumbnail' } as unknown as AuthenticatedRequest;
}

describe('bounded sheet thumbnail admission', () => {
  it('loads 30 derivatives without consuming or loosening original download admission', () => {
    const thumbnails = new SheetThumbnailAdmissionService();
    const originals = new DownloadAdmissionService(new ConfigService());
    const derivative = request('member');
    for (let n = 0; n < 30; n++) thumbnails.acquire(derivative).release();
    expect(derivative.params).toEqual({ id: 'image-1' });
    const original = { ...request('member'), params: { attachmentId: 'attachment-1' } } as unknown as AuthenticatedRequest;
    for (let n = 0; n < 12; n++) originals.acquire(original).release();
    expect(() => originals.acquire(original)).toThrow('下载频率过高');
    for (let n = 30; n < 120; n++) thumbnails.acquire(request('member')).release();
    expect(() => thumbnails.acquire(request('member'))).toThrow('下载频率过高');
  });

  it('retains authentication and a process-wide two-decoder bound', () => {
    const thumbnails = new SheetThumbnailAdmissionService();
    expect(() => thumbnails.acquire({ params: {} } as AuthenticatedRequest)).toThrow('身份认证');
    expect(() => thumbnails.acquire({ ...request('member'), params: {} } as AuthenticatedRequest)).toThrow('下载目标无效');
    const first = thumbnails.acquire(request('member-a'));
    const second = thumbnails.acquire(request('member-b'));
    expect(() => thumbnails.acquire(request('member-c'))).toThrow('过多下载请求');
    first.release(); first.release();
    const third = thumbnails.acquire(request('member-c'));
    expect(() => thumbnails.acquire(request('member-d'))).toThrow('过多下载请求');
    second.release(); third.release();
    expect(() => thumbnails.acquire(request('member-d')).release()).not.toThrow();
  });
});
