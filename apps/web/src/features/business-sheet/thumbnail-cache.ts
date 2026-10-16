export interface ThumbnailAsset { url: string; release(): void }
export interface ThumbnailLease { get(): Promise<string>; release(): void }
type Entry = { id: string; refs: number; state: 'waiting' | 'loading' | 'ready' | 'failed'; controller: AbortController; promise: Promise<string>; resolve(value: string): void; reject(error: unknown): void; asset?: ThumbnailAsset };

/** Shared by the native canvas and lazy detail thumbnails. A failed read stays
 * failed until the user retries; repainting never makes another HTTP request. */
export class ThumbnailCache {
  private readonly entries = new Map<string, Entry>();
  private readonly waiting: Entry[] = [];
  private readonly listeners = new Set<(ids: ReadonlySet<string>) => void>();
  private active = 0;
  constructor(private readonly load: (id: string, signal: AbortSignal) => Promise<ThumbnailAsset>, private readonly concurrency = 2, private readonly capacity = 128) {}
  acquire(id: string): ThumbnailLease {
    let entry = this.entries.get(id);
    if (!entry) {
      if (this.entries.size >= this.capacity) throw new Error('当前可见图片过多，请缩小显示范围后重试。');
      entry = { id, refs: 0 } as Entry;
      this.entries.set(id, entry); this.prepare(entry);
    }
    entry.refs++;
    const own = entry;
    let released = false;
    this.pump();
    return { get: () => own.promise, release: () => {
      if (released) return; released = true;
      if (--own.refs > 0) return;
      own.controller.abort(); own.asset?.release(); delete own.asset;
      // Retain bounded failed entries so visibility changes cannot retry them.
      // They contain no decoded bytes and are cleared only by a user retry.
      if (own.state !== 'failed' && this.entries.get(id) === own) this.entries.delete(id);
      // A queued item may never enter load(), so settle its consumers here too.
      if (own.state === 'waiting') own.reject(new Error('图片视图已经关闭。'));
    } };
  }
  subscribe(listener: (ids: ReadonlySet<string>) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  retryFailed(ids: Iterable<string>) {
    const changed = new Set<string>();
    for (const id of ids) { const entry = this.entries.get(id); if (entry?.state === 'failed') { if (entry.refs) this.prepare(entry); else this.entries.delete(id); changed.add(id); } }
    if (!changed.size) return;
    this.pump(); this.listeners.forEach(listener => listener(changed));
  }
  private prepare(entry: Entry) {
    entry.state = 'waiting'; entry.controller = new AbortController();
    entry.promise = new Promise<string>((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    // A visible item can be released before its consumer attaches a handler.
    void entry.promise.catch(() => {});
    this.waiting.push(entry);
  }
  private pump() {
    while (this.active < this.concurrency && this.waiting.length) {
      const entry = this.waiting.shift()!;
      if (entry.controller.signal.aborted || this.entries.get(entry.id) !== entry) continue;
      entry.state = 'loading'; this.active++;
      void Promise.resolve().then(() => this.load(entry.id, entry.controller.signal)).then(asset => {
        if (entry.controller.signal.aborted || this.entries.get(entry.id) !== entry) { asset.release(); throw new Error('图片视图已经关闭。'); }
        entry.asset = asset; entry.state = 'ready'; entry.resolve(asset.url);
      }).catch(error => { entry.state = 'failed'; entry.reject(error); }).finally(() => { this.active--; this.pump(); });
    }
  }
}
