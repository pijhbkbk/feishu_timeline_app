import { expect, it, vi } from 'vitest';
vi.mock('@univerjs/core', () => ({ ImageSourceType: { UUID: 0 } }));
vi.mock('@univerjs/sheets-drawing', () => ({ SheetDrawingAnchorType: { Position: 'position' } }));
vi.mock('@univerjs/sheets-drawing/facade', () => ({}));
import { bindRuntimeImages } from './runtime-images';

it('does not insert unreadable UUID drawings into the engine repaint loop and recovers on explicit retry', async () => {
  const events = new Map<string, (event: unknown) => void>(), disposeEvent = vi.fn();
  const api = { Event: new Proxy({}, { get: (_target, key) => key }), addEvent: (key: string, callback: (event: unknown) => void) => { events.set(key, callback); return { dispose: disposeEvent }; } };
  const inserted = new Map<string, unknown>();
  const builder: Record<string, unknown> = {};
  for (const key of ['setSource', 'setRow', 'setColumn', 'setRowOffset', 'setColumnOffset', 'setWidth', 'setHeight', 'setAnchorType']) builder[key] = () => builder;
  builder.buildAsync = vi.fn(async () => ({}));
  const sheet = { getVisibleRangesOfAllViewports: () => new Map([['view', { startColumn: 0, endColumn: 2, startRow: 0, endRow: 4 }]]), getRowHeight: () => 38, getColumnWidth: () => 150, getImages: () => [], deleteImages: vi.fn(), getImageById: (id: string) => inserted.get(id), newOverGridImage: () => builder, insertImages: vi.fn((images: Array<{ drawingId: string }>) => images.forEach(image => inserted.set(image.drawingId, image))), updateImages: vi.fn() };
  const image = { id: 'image-a', recordId: 'record-a', fieldKey: 'photos', mode: 'CELL', revision: 1, width: 40, height: 30 };
  let retry: (() => void) | undefined; let frame: (() => void) | undefined;
  const getImage = vi.fn().mockRejectedValue(new Error('429'));
  const io = { getImage, retain: vi.fn(), onRetry: (fn: () => void) => { retry = fn; return vi.fn(); } };
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frame = fn; return 1; }); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const controller = bindRuntimeImages(api as never, { getActiveSheet: () => sheet } as never, { rows: [{}], columns: [{}], position: () => ({ row: 1, col: 0 }) } as never, { addEventListener: vi.fn(), removeEventListener: vi.fn() } as never, {} as never, run => run(), vi.fn(), io);
  try {
    await controller.render([image] as never); await controller.render();
    expect(sheet.insertImages).not.toHaveBeenCalled(); expect(builder.buildAsync).not.toHaveBeenCalled();
    getImage.mockResolvedValue('blob:ready'); retry!(); expect(frame).toBeTypeOf('function'); frame!();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(sheet.insertImages).toHaveBeenCalledTimes(1); expect(io.retain).toHaveBeenCalledWith(new Set(['image-a']));
  } finally { controller.dispose(); vi.unstubAllGlobals(); }
});
