import { IImageIoService, type IImageIoServiceParam } from '@univerjs/core';
import { ImageIoService, UniverDrawingPlugin, UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';
export class RecordImageIo extends ImageIoService {
  private readonly requests = new Map<string, Promise<string>>();
  private readonly releases = new Set<() => void>();
  private readonly abort = new AbortController();
  constructor(private readonly callbacks: { thumbnail: (id: string, options: { signal: AbortSignal }) => Promise<{ url: string; release?: () => void }>; onError: (message: string) => void }) { super(); }
  override getImage(assetId: string): Promise<string> {
    if (this.abort.signal.aborted) return Promise.reject(new Error('图片视图已经关闭。'));
    let pending = this.requests.get(assetId);
    if (!pending) {
      pending = this.callbacks.thumbnail(assetId, { signal: this.abort.signal }).then(value => {
        if (this.abort.signal.aborted) { value.release?.(); throw new Error('图片视图已经关闭。'); }
        if (value.release) this.releases.add(value.release);
        return value.url;
      }).catch(error => {
        this.requests.delete(assetId);
        if (!this.abort.signal.aborted) this.callbacks.onError('图片暂时无法读取；资源引用保留，请检查权限或网络后重试。');
        throw error;
      });
      this.requests.set(assetId, pending);
    }
    return pending;
  }
  override async saveImage(): Promise<IImageIoServiceParam | null> {
    // Every native entry is intercepted below so an image cannot become an
    // ownerless upload. Never fake success with BASE64/blob as durable identity.
    throw new Error('请先选择明确的记录，通过添加照片入口上传。');
  }
  dispose() { this.abort.abort(); this.releases.forEach(release => release()); this.releases.clear(); this.requests.clear(); }
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
