import { describe, expect, it, vi } from 'vitest';
import { ThumbnailCache, type ThumbnailAsset } from './thumbnail-cache';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('shared, bounded thumbnail reads', () => {
  it('shares one request for detail and canvas, even after 581 failed repaint reads, and retries only explicitly', async () => {
    const asset = { url: 'blob:confirmed', release: vi.fn() };
    const load = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue(asset);
    const cache = new ThumbnailCache(load);
    const canvas = cache.acquire('image-a'), panel = cache.acquire('image-a');
    expect(canvas.get()).toBe(panel.get());
    await expect(canvas.get()).rejects.toThrow('429');
    for (let i = 0; i < 581; i++) await expect(canvas.get()).rejects.toThrow('429');
    expect(load).toHaveBeenCalledTimes(1);
    panel.release(); const panelAgain = cache.acquire('image-a');
    await expect(panelAgain.get()).rejects.toThrow('429'); expect(load).toHaveBeenCalledTimes(1);
    const notified = vi.fn(); cache.subscribe(notified); cache.retryFailed(['image-a']);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(canvas.get()).toBe(panelAgain.get()); await expect(canvas.get()).resolves.toBe('blob:confirmed');
    expect(load).toHaveBeenCalledTimes(2);
    cache.retryFailed(['image-a']); expect(load).toHaveBeenCalledTimes(2);
    canvas.release(); expect(asset.release).not.toHaveBeenCalled(); panelAgain.release(); panelAgain.release(); expect(asset.release).toHaveBeenCalledTimes(1);
  });
  it('queues 30 visible thumbnails at concurrency two and starts none for unrequested offscreen records', async () => {
    let active = 0, maximum = 0;
    const pending = new Map<string, ReturnType<typeof deferred<ThumbnailAsset>>>();
    const load = vi.fn(async (id: string) => { active++; maximum = Math.max(maximum, active); const job = deferred<ThumbnailAsset>(); pending.set(id, job); try { return await job.promise; } finally { active--; } });
    const cache = new ThumbnailCache(load); const leases = Array.from({ length: 30 }, (_, index) => cache.acquire(`visible-${index}`));
    await drain(); expect(load).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 30; index++) { const id = `visible-${index}`; expect(pending.has(id)).toBe(true); pending.get(id)!.resolve({ url: `blob:${id}`, release: () => {} }); await leases[index]!.get(); await drain(); }
    expect(maximum).toBe(2); expect(load).toHaveBeenCalledTimes(30); expect(load.mock.calls.some(([id]) => id.startsWith('offscreen'))).toBe(false);
    leases.forEach(lease => lease.release());
  });
  it('aborts an unmounted read, cancels queued work, and revokes a late result once', async () => {
    const first = deferred<ThumbnailAsset>(), asset = { url: 'blob:late', release: vi.fn() }; let signal: AbortSignal | undefined;
    const load = vi.fn((_id: string, value: AbortSignal) => { signal = value; return first.promise; });
    const cache = new ThumbnailCache(load, 1), live = cache.acquire('live'), queued = cache.acquire('offscreen');
    await drain(); queued.release(); await expect(queued.get()).rejects.toThrow('关闭'); live.release(); expect(signal?.aborted).toBe(true);
    first.resolve(asset); await expect(live.get()).rejects.toThrow('关闭'); await drain(); expect(asset.release).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
  });
  it('does not retry failed images when scrolling them out and back, and caps the cache', async () => {
    const load = vi.fn().mockRejectedValue(new Error('403')); const cache = new ThumbnailCache(load, 2, 2);
    const one = cache.acquire('one'); await expect(one.get()).rejects.toThrow('403'); one.release();
    const again = cache.acquire('one'); await expect(again.get()).rejects.toThrow('403'); expect(load).toHaveBeenCalledTimes(1); again.release();
    const two = cache.acquire('two'); await expect(two.get()).rejects.toThrow('403'); expect(() => cache.acquire('three')).toThrow('图片过多');
    cache.retryFailed(['one']); const recovered = cache.acquire('one'); await expect(recovered.get()).rejects.toThrow('403'); expect(load).toHaveBeenCalledTimes(3); recovered.release(); two.release();
  });
});
