import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/auth-client', () => ({
  API_BASE_URL: '/api', apiRequest: vi.fn(), normalizeApiErrorMessage: vi.fn(),
  ApiRequestError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
import { imageBytes, type SheetImage } from './image-client';
const image = { contentUrl: '/attachments/original/content' } as SheetImage;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('original image reads respect attachment admission', () => {
  it('waits for Retry-After and returns the actual original bytes', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetcher);
    const pending = imageBytes(image); await vi.advanceTimersByTimeAsync(2000); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100); expect(await pending).toEqual({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('never retries an access denial or a missing retry budget', async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      const fetcher = vi.fn().mockResolvedValue(new Response('', { status })); vi.stubGlobal('fetch', fetcher);
      await expect(imageBytes(image)).rejects.toMatchObject({ status }); expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('bounds repeated throttles to two waits and supports cancellation', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(() => Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '1' } })));
    vi.stubGlobal('fetch', fetcher); const pending = expect(imageBytes(image)).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(2500); await pending; expect(fetcher).toHaveBeenCalledTimes(3);
    const controller = new AbortController(); const cancelled = expect(imageBytes(image, controller.signal)).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(100); controller.abort(new Error('cancelled')); await cancelled;
    await vi.advanceTimersByTimeAsync(5000); expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
