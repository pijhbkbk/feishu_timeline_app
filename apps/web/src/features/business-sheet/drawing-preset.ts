import { IImageIoService, type IImageIoServiceParam } from '@univerjs/core';
import { ImageIoService, UniverDrawingPlugin, UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';
import { sheetThumbnails } from './thumbnail-client';
import type { ThumbnailLease } from './thumbnail-cache';
export class RecordImageIo extends ImageIoService {
  private readonly leases = new Map<string, ThumbnailLease>();
  private readonly reported = new Set<string>();
  private disposed = false;
  constructor(private readonly onError: (message: string) => void) { super(); }
  override getImage(assetId: string): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('图片视图已经关闭。'));
    let lease = this.leases.get(assetId);
    if (!lease) { lease = sheetThumbnails.acquire(assetId); this.leases.set(assetId, lease); }
    return lease.get().catch(error => {
      if (!this.disposed && this.leases.get(assetId) === lease && !this.reported.has(assetId)) { this.reported.add(assetId); this.onError('图片暂时无法读取；资源引用保留，可在记录照片处重试缩略图。'); }
      throw error;
    });
  }
  retain(ids: ReadonlySet<string>) {
    for (const [id, lease] of this.leases) if (!ids.has(id)) { lease.release(); this.leases.delete(id); this.reported.delete(id); }
  }
  onRetry(redraw: () => void) {
    return sheetThumbnails.subscribe(ids => { if ([...ids].some(id => this.leases.has(id))) { ids.forEach(id => this.reported.delete(id)); redraw(); } });
  }
  override async saveImage(): Promise<IImageIoServiceParam | null> {
    // Every native entry is intercepted so no upload loses its record identity.
    throw new Error('请先选择明确的记录，通过添加照片入口上传。');
  }
  dispose() { this.disposed = true; this.leases.forEach(lease => lease.release()); this.leases.clear(); this.reported.clear(); }
}

export function createRecordDrawingPreset(io: RecordImageIo) {
  const preset = UniverSheetsDrawingPreset({ allowImageSize: 5 * 1024 * 1024 });
  preset.plugins = preset.plugins.map(entry => {
    const plugin = Array.isArray(entry) ? entry[0] : entry;
    return plugin !== UniverDrawingPlugin ? entry : [UniverDrawingPlugin, {
      ...(Array.isArray(entry) ? entry[1] : {}), override: [[IImageIoService, { useValue: io }]],
    }];
  });
  return preset;
}
