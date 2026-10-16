import { ImageSourceType } from '@univerjs/core';
import type { FUniver } from '@univerjs/core/facade';
import type { FWorkbook } from '@univerjs/sheets/facade';
import { SheetDrawingAnchorType } from '@univerjs/sheets-drawing';
import '@univerjs/sheets-drawing/facade';
import type { BusinessSheetModel } from './runtime-model';
import type { RecordImageIo } from './drawing-preset';
import type { ImageLayout, SheetImage } from './image-client';
export interface RuntimeImageActions {
  add(files: File[], recordId: string): void;
  change(image: SheetImage, layout: ImageLayout): void;
  remove(image: SheetImage): void;
  requestFiles(): void;
}
export const drawingCommands = new Set(['sheet.command.move-drawing', 'sheet.command.set-sheet-image', 'sheet.command.set-drawing-placement', 'sheet.command.remove-sheet-image', 'sheet.command.delete-drawing', 'sheet.mutation.set-drawing-apply', 'sheet.operation.clear-drawing-transformer', 'sheet.operation.edit-sheet-image', 'sidebar.operation.sheet-image']);
export function bindRuntimeImages(api: FUniver, workbook: FWorkbook, model: BusinessSheetModel, container: HTMLElement, actions: RuntimeImageActions, silence: <T>(run: () => T) => T, onError: (message: string) => void, imageIo: Pick<RecordImageIo, 'getImage' | 'retain' | 'onRetry'>) {
  const sheet = workbook.getActiveSheet();
  let images: readonly SheetImage[] = [], internal = 0, generation = 0, disposed = false, frame = 0;
  const rendered = new Map<string, string>();
  const own = (id: string) => images.find(image => image.id === id);
  const prefix = (count: number, size: (index: number) => number) => { let sum = 0; for (let index = 0; index < count; index++) sum += size(index); return sum; };
  function mutate<T>(run: () => T) { internal++; try { return silence(run); } finally { internal--; } }
  async function render(next: readonly SheetImage[] = images) {
    images = next; const version = ++generation;
    const ranges = [...sheet.getVisibleRangesOfAllViewports()?.values() ?? []];
    const rowTops = [0], colLefts = [0];
    for (let row = 0; row <= model.rows.length + 1; row++) rowTops.push(rowTops.at(-1)! + sheet.getRowHeight(row));
    for (let col = 0; col <= model.columns.length; col++) colLefts.push(colLefts.at(-1)! + sheet.getColumnWidth(col));
    const visible = next.filter(image => {
      const position = model.position(image.recordId, image.fieldKey); if (!position) return false;
      const x = colLefts[position.col]! + (image.mode === 'CELL' ? 4 : image.offsetX), y = rowTops[position.row]! + (image.mode === 'CELL' ? 4 : image.offsetY);
      return ranges.some(range => x + image.width >= (colLefts[Math.max(0, range.startColumn - 1)] ?? 0) && x <= (colLefts[Math.min(model.columns.length, range.endColumn + 2)] ?? Infinity) && y + image.height >= (rowTops[Math.max(0, range.startRow - 3)] ?? 0) && y <= (rowTops[Math.min(model.rows.length + 1, range.endRow + 4)] ?? Infinity));
    });
    mutate(() => sheet.deleteImages(sheet.getImages().filter(image => !visible.some(value => value.id === image.getId()))));
    const visibleIds = new Set(visible.map(image => image.id));
    imageIo.retain(visibleIds);
    for (const id of rendered.keys()) if (!visibleIds.has(id)) rendered.delete(id);
    for (const image of visible) {
      if (disposed || generation !== version) return;
      const position = model.position(image.recordId, image.fieldKey)!;
      const signature = `${image.revision}:${position.row}:${position.col}:${sheet.getRowHeight(position.row)}:${sheet.getColumnWidth(position.col)}`;
      if (rendered.get(image.id) === signature && sheet.getImageById(image.id)) continue;
      // Do not register an unreadable drawing: Univer retries missing image
      // shapes during every repaint. Failed reads wait for explicit UI retry.
      try { await imageIo.getImage(image.id); } catch { continue; }
      if (disposed || generation !== version) return;
      const factor = image.mode === 'CELL' ? Math.min(1, (sheet.getRowHeight(position.row) - 8) / image.height, (sheet.getColumnWidth(position.col) - 8) / image.width) : 1;
      const data = await sheet.newOverGridImage().setSource(image.id, ImageSourceType.UUID).setRow(position.row).setColumn(position.col)
        .setRowOffset(image.mode === 'CELL' ? 4 : image.offsetY).setColumnOffset(image.mode === 'CELL' ? 4 : image.offsetX)
        .setWidth(Math.max(16, image.width * factor)).setHeight(Math.max(16, image.height * factor)).setAnchorType(SheetDrawingAnchorType.Position).buildAsync();
      if (disposed || generation !== version) return;
      data.drawingId = image.id;
      mutate(() => { if (sheet.getImageById(image.id)) sheet.updateImages([data]); else sheet.insertImages([data]); });
      rendered.set(image.id, signature);
    }
  }
  const redraw = () => { if (frame || disposed) return; frame = requestAnimationFrame(() => { frame = 0; void render().catch(cause => onError(cause instanceof Error ? cause.message : '图片显示失败')); }); };
  const unsubscribeRetry = imageIo.onRetry(redraw);
  const subscriptions = [
    api.addEvent(api.Event.Scroll, event => { if (event.workbook.getId() === workbook.getId()) redraw(); }),
    api.addEvent(api.Event.CommandExecuted, event => { if (/set-worksheet-col-width|set-worksheet-row-height|set-frozen/.test(event.id)) redraw(); }),
    api.addEvent(api.Event.BeforeCommandExecute, event => {
      if (event.id !== 'sheet.command.insert-float-image' && event.id !== 'sheet.command.insert-cell-image') return;
      event.cancel = true;
      const files = (event.params as { files?: File[] } | undefined)?.files;
      const active = sheet.getActiveCell(); const target = active && model.identity(active.getRow(), active.getColumn());
      if (files?.length && target) actions.add(files, target.id); else actions.requestFiles();
    }),
    api.addEvent(api.Event.BeforeOverGridImageInsert, event => {
      if (internal || event.workbook.getId() !== workbook.getId()) return;
      event.cancel = true; onError('新图片请通过添加照片或粘贴截图明确归属后保存。');
    }),
    api.addEvent(api.Event.BeforeOverGridImageChange, event => {
      if (internal || event.workbook.getId() !== workbook.getId()) return;
      if (event.images.some(({ image, changeParam }) => !own(image.getId()) || changeParam.source !== undefined && changeParam.source !== image.getId() || changeParam.subUnitId !== undefined && changeParam.subUnitId !== sheet.getSheetId())) { event.cancel = true; onError('图片归属不能通过表格操作修改。'); }
    }),
    api.addEvent(api.Event.BeforeOverGridImageRemove, event => {
      if (internal || event.workbook.getId() !== workbook.getId()) return;
      // Keep the drawing visible until the server confirms deletion.
      event.cancel = true; event.images.forEach(image => { const saved = own(image.getId()); if (saved) actions.remove(saved); });
    }),
    api.addEvent(api.Event.OverGridImageChanged, event => {
      if (internal || event.workbook.getId() !== workbook.getId()) return;
      for (const current of event.images) {
        const image = own(current.getId()); if (!image) continue;
        const position = model.position(image.recordId, image.fieldKey); if (!position) continue;
        const placement = current.getPlacement();
        if (placement.kind !== SheetDrawingAnchorType.Position) { onError('图片位置类型不支持，请重新读取。'); continue; }
        const offsetX = prefix(placement.from.column, col => sheet.getColumnWidth(col)) + placement.from.columnOffset - prefix(position.col, col => sheet.getColumnWidth(col));
        const offsetY = prefix(placement.from.row, row => sheet.getRowHeight(row)) + placement.from.rowOffset - prefix(position.row, row => sheet.getRowHeight(row));
        if (Math.abs(offsetX) > 4096 || Math.abs(offsetY) > 4096 || placement.width > 4096 || placement.height > 4096) { onError('图片位置或大小超出允许范围，请调整后保存。'); continue; }
        actions.change(image, { fieldKey: image.fieldKey, mode: 'FLOATING', offsetX: Math.round(offsetX), offsetY: Math.round(offsetY), width: Math.max(16, Math.round(placement.width)), height: Math.max(16, Math.round(placement.height)) });
      }
    }),
  ];
  const paste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const active = sheet.getActiveCell(); const target = active && model.identity(active.getRow(), active.getColumn());
    if (!target) onError('请先选择记录，再粘贴截图。'); else actions.add(files, target.id);
  };
  container.addEventListener('paste', paste, true);
  return { render, dispose() { disposed = true; generation++; unsubscribeRetry(); cancelAnimationFrame(frame); container.removeEventListener('paste', paste, true); subscriptions.forEach(value => value.dispose()); images = []; rendered.clear(); } };
}
