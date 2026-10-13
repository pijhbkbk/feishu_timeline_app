import { expect, it, vi } from 'vitest';
vi.mock('@univerjs/core', () => ({ IImageIoService: Symbol('image-io') }));
vi.mock('@univerjs/preset-sheets-drawing', () => ({ ImageIoService: class {}, UniverDrawingPlugin: class {}, UniverSheetsDrawingPreset: vi.fn() }));
vi.mock('./thumbnail-client', () => ({ sheetThumbnails: { acquire: vi.fn(), subscribe: vi.fn() } }));
import { RecordImageIo } from './drawing-preset';
import { sheetThumbnails } from './thumbnail-client';

it('ignores a pending read cancelled when its record scrolls offscreen', async () => {
  let reject!: (error: unknown) => void;
  const pending = new Promise<string>((_resolve, fail) => { reject = fail; });
  const lease = { get: () => pending, release: vi.fn(() => reject(new Error('aborted'))) };
  vi.mocked(sheetThumbnails.acquire).mockReturnValue(lease);
  const report = vi.fn(), io = new RecordImageIo(report), read = io.getImage('image-a');
  io.retain(new Set()); await expect(read).rejects.toThrow('aborted'); expect(lease.release).toHaveBeenCalledOnce(); expect(report).not.toHaveBeenCalled(); io.dispose();
});

it('reports an actual visible failure once across repeated repaint reads', async () => {
  const lease = { get: () => Promise.reject(new Error('429')), release: vi.fn() }; vi.mocked(sheetThumbnails.acquire).mockReturnValue(lease);
  const report = vi.fn(), io = new RecordImageIo(report);
  for (let count = 0; count < 10; count++) await expect(io.getImage('image-a')).rejects.toThrow('429');
  expect(report).toHaveBeenCalledOnce(); io.dispose();
});
