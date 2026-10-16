import type ExcelJS from 'exceljs';

/** Browser-safe proposal. The caller supplies a Workbook loaded from a bounded,
 * verified ZIP; no network, filesystem, Node built-ins, or API writes occur here. */
export const IMAGE_LIMITS = { bytes: 5 * 1024 * 1024, images: 1000, rows: 10000, columns: 1000, pixels: 40_000_000, emuPerPixel: 9525 } as const;
export type ImageTarget = { kind: 'existing'; recordId: string } | { kind: 'draft'; clientRowId: string };
export interface ImageMarker { row: number; column: number; rowOffset: number; columnOffset: number }
export interface ImageAnchor {
  kind: 'oneCell' | 'twoCell' | 'absolute';
  from: ImageMarker;
  to?: ImageMarker;
  width?: number;
  height?: number;
}
export interface ImageIssue { code: string; message: string; part?: string; sheet?: string; imageKey?: string }
export interface EmbeddedImage {
  /** Source identity only; generate a new durable drawingId when applying a new import. */
  imageKey: string;
  sheetId: string;
  sheetName: string;
  sourceMediaId: string;
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  anchor: ImageAnchor | null;
  occupiedRows: { first: number; last: number } | null; // one-based Excel rows
  target: ImageTarget | null;
  status: 'ready' | 'pending' | 'error';
  issues: ImageIssue[];
}
export interface ImageImportResult { images: EmbeddedImage[]; issues: ImageIssue[]; counts: { ready: number; pending: number; errors: number; unsupported: number } }
export interface ImageImportOptions {
  /** Maps only already-authorized records or explicit new-row drafts, never names. */
  rowTargets(sheetId: string): ReadonlyMap<number, ImageTarget>;
  /** From the ZIP preflight before ExcelJS discards unsupported drawing objects. */
  archiveIssues?: readonly ImageIssue[];
  archiveInspected: boolean;
}
const validNonNegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const positive = (n: unknown): n is number => validNonNegative(n) && n > 0;
const sameTarget = (a: ImageTarget, b: ImageTarget) => a.kind === b.kind && (a.kind === 'existing' ? a.recordId === (b as typeof a).recordId : a.clientRowId === (b as typeof a).clientRowId);

function bytesFromMedia(media: unknown): Uint8Array {
  if (!media || typeof media !== 'object') throw new Error('缺少图片媒体内容。');
  const value = media as { buffer?: unknown; base64?: unknown; filename?: unknown };
  // Filenames and external URLs are deliberately not dereferenced.
  if (value.buffer instanceof Uint8Array) return new Uint8Array(value.buffer);
  if (value.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer.slice(0));
  if (Array.isArray(value.buffer) && value.buffer.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return Uint8Array.from(value.buffer);
  if (typeof value.base64 === 'string') {
    const raw = value.base64.replace(/^data:image\/(?:png|jpe?g);base64,/i, '');
    if (raw.length > Math.ceil(IMAGE_LIMITS.bytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error('图片 base64 内容不合法或过大。');
    return Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  }
  throw new Error('未提供图片字节；不读取文件名或外部图片 URL。');
}
export function mimeFromBytes(bytes: Uint8Array, extension: unknown): EmbeddedImage['mime'] {
  if (!bytes.length || bytes.length > IMAGE_LIMITS.bytes) throw new Error('单张图片须为 1 字节至 5 MiB。');
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ext = typeof extension === 'string' ? extension.toLowerCase() : '';
  if (png && ext === 'png') { imageDimensions(bytes, 'image/png'); return 'image/png'; }
  if (jpeg && (ext === 'jpeg' || ext === 'jpg')) { imageDimensions(bytes, 'image/jpeg'); return 'image/jpeg'; }
  throw new Error('仅支持字节签名与扩展名一致的 PNG/JPEG；完整解码仍由上传服务检查。');
}
/** Header dimensions are a client preflight, never a replacement for server
 * full decode / scanning. No image decoder is invoked on an unbounded file. */
export function imageDimensions(bytes: Uint8Array, mime: EmbeddedImage['mime']): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (width: number, height: number) => {
    if (!width || !height || width * height > IMAGE_LIMITS.pixels) throw new Error('图片像素尺寸无效或超过 40 MP。');
    return { width, height };
  };
  if (mime === 'image/png') {
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('PNG 缺少有效图片头。');
    return check(view.getUint32(16), view.getUint32(20));
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255) throw new Error('JPEG 标记不完整。');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++]!;
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('JPEG 图片段被截断。');
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) throw new Error('JPEG 缺少像素尺寸。');
      return check(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    offset += length;
  }
  throw new Error('JPEG 缺少有效尺寸头。');
}
function marker(raw: unknown): ImageMarker | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (![value.nativeRow, value.nativeCol, value.nativeRowOff, value.nativeColOff].every(validNonNegative)) return null;
  if (!Number.isInteger(value.nativeRow) || !Number.isInteger(value.nativeCol) || Number(value.nativeRow) >= IMAGE_LIMITS.rows || Number(value.nativeCol) >= IMAGE_LIMITS.columns) return null;
  return { row: Number(value.nativeRow), column: Number(value.nativeCol), rowOffset: Number(value.nativeRowOff) / IMAGE_LIMITS.emuPerPixel, columnOffset: Number(value.nativeColOff) / IMAGE_LIMITS.emuPerPixel };
}
function readAnchor(value: unknown): ImageAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const from = marker(raw.tl); if (!from) return null;
  const to = marker(raw.br);
  const ext = raw.ext as { width?: unknown; height?: unknown } | undefined;
  const kind = raw.editAs === 'absolute' ? 'absolute' : raw.editAs === 'oneCell' || !to ? 'oneCell' : 'twoCell';
  if (to) return { kind, from, to };
  if (positive(ext?.width) && positive(ext?.height)) return { kind, from, width: ext.width, height: ext.height };
  return null;
}
function rowHeight(sheet: ExcelJS.Worksheet, index: number): number {
  // findRow does not allocate empty rows in the caller's workbook.
  const row = sheet.findRow(index + 1);
  if (row?.hidden) return 0;
  return (row?.height ?? sheet.properties.defaultRowHeight ?? 15) * 96 / 72;
}
function rowPosition(sheet: ExcelJS.Worksheet, marker: ImageMarker): number {
  let result = marker.rowOffset;
  for (let r = 0; r < marker.row; r++) result += rowHeight(sheet, r);
  return result;
}
function rowAt(sheet: ExcelJS.Worksheet, y: number): number | null {
  let top = 0;
  for (let row = 0; row < IMAGE_LIMITS.rows; row++) {
    const height = rowHeight(sheet, row);
    if (height > 0 && y < top + height) return row;
    top += height;
  }
  return null;
}
function coverage(sheet: ExcelJS.Worksheet, anchor: ImageAnchor): EmbeddedImage['occupiedRows'] {
  if (anchor.kind === 'absolute') return null; // Absolute objects require an explicit human assignment.
  const top = rowPosition(sheet, anchor.from);
  const bottom = anchor.to ? rowPosition(sheet, anchor.to) : top + (anchor.height ?? 0);
  if (!Number.isFinite(bottom) || bottom <= top) return null;
  const first = rowAt(sheet, top), last = rowAt(sheet, Math.max(top, bottom - 1e-6));
  return first === null || last === null ? null : { first: first + 1, last: last + 1 };
}
function colNumber(value: string): number { let n = 0; for (const c of value) n = n * 26 + c.charCodeAt(0) - 64; return n; }
function touchesMergedCell(sheet: ExcelJS.Worksheet, anchor: ImageAnchor, rows: NonNullable<EmbeddedImage['occupiedRows']>): boolean {
  // With ext-only geometry the exact right edge requires column-width conversion;
  // conservatively flag a merge intersecting any occupied row for manual review.
  const firstCol = anchor.from.column + 1;
  const lastCol = anchor.to ? anchor.to.column + (anchor.to.columnOffset > 0 ? 1 : 0) : Infinity;
  return (sheet.model.merges ?? []).some(range => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range); if (!m) return true;
    return Number(m[2]) <= rows.last && Number(m[4]) >= rows.first && colNumber(m[1]!) <= lastCol && colNumber(m[3]!) >= firstCol;
  });
}

/** Mutates only this newly-created preview item, not the caller's workbook. */
export function classifyImage(image: EmbeddedImage, sheet: ExcelJS.Worksheet, options: ImageImportOptions): void {
  image.occupiedRows = image.anchor ? coverage(sheet, image.anchor) : null;
  image.status = 'pending';
  const issue = (code: string, message: string) => image.issues.push({ code, message, sheet: sheet.name, imageKey: image.imageKey });
  if (!options.archiveInspected) issue('INSPECTION_REQUIRED', '原始图片部件尚未完成检查，请先完成导入检查。');
  if (!image.anchor || !image.occupiedRows) issue('ANCHOR_UNRESOLVED', '绝对定位、缺少锚点或无法确定范围，请指定图片归属。');
  else if (image.occupiedRows.first !== image.occupiedRows.last) issue('SPANS_ROWS', '图片跨多行，请明确指定归属记录；不会使用最近行。');
  else if (touchesMergedCell(sheet, image.anchor, image.occupiedRows)) issue('MERGED_RANGE', '图片涉及合并区域，请明确指定归属记录。');
  else {
    const target = options.rowTargets(String(sheet.id)).get(image.occupiedRows.first);
    if (!target) issue('RECORD_UNRESOLVED', '图片所在行没有明确、已授权的记录或新增草稿。');
    else if (!image.issues.length) { image.target = target; image.status = 'ready'; }
  }
}

export function readEmbeddedImages(workbook: ExcelJS.Workbook, options: ImageImportOptions): ImageImportResult {
  const result: ImageImportResult = { images: [], issues: [...options.archiveIssues ?? []], counts: { ready: 0, pending: 0, errors: 0, unsupported: options.archiveIssues?.length ?? 0 } };
  if (!options.archiveInspected) result.issues.push({ code: 'INSPECTION_REQUIRED', message: '尚未检查原始绘图部件；不能宣称所有图片都已识别。' });
  for (const sheet of workbook.worksheets) {
    const sheetId = String(sheet.id);
    const sheetImages = sheet.getImages();
    for (let index = 0; index < sheetImages.length; index++) {
      if (result.images.length >= IMAGE_LIMITS.images) throw new Error('图片实例超过 1000 个上限。');
      const source = sheetImages[index]!;
      const imageKey = `${sheetId}:${String(source.imageId)}:${index}`;
      const image: EmbeddedImage = { imageKey, sheetId, sheetName: sheet.name, sourceMediaId: String(source.imageId), bytes: new Uint8Array(), mime: 'image/png', anchor: null, occupiedRows: null, target: null, status: 'error', issues: [] };
      const issue = (code: string, message: string) => image.issues.push({ code, message, sheet: sheet.name, imageKey });
      try {
        const media = workbook.getImage(Number(source.imageId));
        image.bytes = bytesFromMedia(media); image.mime = mimeFromBytes(image.bytes, media?.extension);
        image.anchor = readAnchor(source.range);
        classifyImage(image, sheet, options);
      } catch (error) { image.status = 'error'; issue('INVALID_IMAGE', error instanceof Error ? error.message : '图片无法解析。'); }
      result.images.push(image);
      if (image.status === 'ready') result.counts.ready++; else if (image.status === 'pending') result.counts.pending++; else result.counts.errors++;
    }
  }
  return result;
}

/** Explicit assignment is a UI action. Membership must be verified against the
 * caller's authorized targets; never accept an arbitrary imported record ID. */
export function assignImage(image: EmbeddedImage, target: ImageTarget, authorized: readonly ImageTarget[]): EmbeddedImage {
  if (image.status === 'error' || !image.bytes.length || image.issues.some(issue => issue.code === 'INSPECTION_REQUIRED')) throw new Error('损坏图片不能分配归属。');
  if (!authorized.some(item => sameTarget(item, target))) throw new Error('目标不在当前已授权记录或明确新增草稿中。');
  return { ...image, target, status: 'ready', issues: [...image.issues, { code: 'EXPLICIT_ASSIGNMENT', message: '归属由用户明确指定；提交时仍须服务端校验。', imageKey: image.imageKey }] };
}

export interface ImageExportItem { assetKey: string; bytes: Uint8Array; mime: EmbeddedImage['mime']; sheetId: number; anchor: ImageAnchor }
/** Returns ExcelJS media IDs. The caller decides export range and checks access. */
export function writeEmbeddedImages(workbook: ExcelJS.Workbook, images: readonly ImageExportItem[]): number[] {
  if (images.length > IMAGE_LIMITS.images) throw new Error('图片实例超过 1000 个上限。');
  const ids: number[] = []; const media = new Map<string, { id: number; bytes: Uint8Array; mime: string }>();
  const native = (m: ImageMarker) => ({ nativeRow: m.row, nativeCol: m.column, nativeRowOff: Math.round(m.rowOffset * IMAGE_LIMITS.emuPerPixel), nativeColOff: Math.round(m.columnOffset * IMAGE_LIMITS.emuPerPixel) });
  for (const image of images) {
    mimeFromBytes(image.bytes, image.mime === 'image/png' ? 'png' : 'jpeg');
    if (!image.assetKey) throw new Error('图片导出缺少稳定资源标识。');
    const sheet = workbook.getWorksheet(image.sheetId); if (!sheet) throw new Error('图片导出目标工作表不存在。');
    const a = image.anchor;
    for (const m of [a.from, ...(a.to ? [a.to] : [])]) if (!Number.isInteger(m.row) || !Number.isInteger(m.column) || m.row >= IMAGE_LIMITS.rows || m.column >= IMAGE_LIMITS.columns || ![m.row, m.column, m.rowOffset, m.columnOffset].every(validNonNegative)) throw new Error('图片导出锚点无效。');
    if (a.to && (rowPosition(sheet, a.to) <= rowPosition(sheet, a.from) || a.to.column < a.from.column || (a.to.column === a.from.column && a.to.columnOffset <= a.from.columnOffset))) throw new Error('图片导出锚点不能形成正尺寸矩形。');
    let cached = media.get(image.assetKey);
    if (cached && (cached.mime !== image.mime || cached.bytes.length !== image.bytes.length || cached.bytes.some((v, i) => image.bytes[i] !== v))) throw new Error('同一资源标识出现不同图片字节。');
    if (!cached) {
      // ExcelJS accepts Uint8Array in its browser ZIP path despite its Buffer declaration.
      const id = workbook.addImage({ extension: image.mime === 'image/png' ? 'png' : 'jpeg', buffer: new Uint8Array(image.bytes) as never });
      cached = { id, bytes: image.bytes, mime: image.mime }; media.set(image.assetKey, cached);
    }
    if (a.to) sheet.addImage(cached.id, { tl: native(a.from), br: native(a.to), editAs: a.kind } as never);
    else {
      if (!positive(a.width) || !positive(a.height)) throw new Error('图片导出缺少有效尺寸。');
      sheet.addImage(cached.id, { tl: native(a.from), ext: { width: a.width, height: a.height }, editAs: a.kind } as never);
    }
    ids.push(cached.id);
  }
  return ids;
}

/** Conservative archive feature scanner, run on verified bounded ZIP entries.
 * This does not fetch relationships or interpret arbitrary XML. It flags ranges
 * ExcelJS may discard; a warning is never converted into a success count. */
export function inspectUnsupportedImageParts(files: Readonly<Record<string, Uint8Array>>): ImageIssue[] {
  const issues: ImageIssue[] = []; const decoder = new TextDecoder();
  for (const [part, bytes] of Object.entries(files)) {
    const add = (code: string, message: string) => issues.push({ code, message, part });
    if (/^xl\/(?:cellimages\.xml|richData\/)/i.test(part)) add('CELL_IMAGE', '发现 WPS DISPIMG/真正单元格图片或富值部件；请手动上传或明确转换。');
    if (/^xl\/media\/.*\.(?!png$|jpe?g$)[^.]+$/i.test(part)) add('UNSUPPORTED_MEDIA', '发现非 PNG/JPEG 媒体资源；不作为已导入图片。');
    if (!/\.xml$|\.rels$/i.test(part)) continue;
    const xml = decoder.decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支持带 DTD 或实体声明的 Excel 图片部件。');
    if (/^xl\/worksheets\/.*\.xml$/i.test(part) && /<(?:[\w.-]+:)?picture\b/.test(xml)) add('BACKGROUND_IMAGE', '发现工作表背景图片；不自动转换为记录照片。');
    if (/<(?:[\w.-]+:)?f\b[^>]*>[^<]*(?:DISPIMG|(?:_xlfn\.)?IMAGE)\s*\(/i.test(xml)) add('IMAGE_FORMULA', '发现 DISPIMG/IMAGE 公式；不执行公式或读取外部图片。');
    if (/^xl\/drawings\/_rels\/.*\.rels$/i.test(part) && /TargetMode\s*=\s*["']External["']/i.test(xml)) add('EXTERNAL_IMAGE', '绘图包含外部关系；不访问远端 URL，请手动上传。');
    if (!/^xl\/drawings\/[^/]+\.xml$/i.test(part)) continue;
    if (/<(?:[\w.-]+:)?(?:graphicFrame|sp|grpSp|cxnSp|contentPart)\b/.test(xml)) add('UNSUPPORTED_DRAWING', '发现图表、形状或组合绘图；其内容不算作普通嵌入照片。');
    if (/<(?:[\w.-]+:)?(?:srcRect|effectLst|effectDag|scene3d|sp3d|tile)\b/.test(xml) || /\b(?:rot|flipH|flipV)\s*=\s*["'](?:[1-9]|true)/i.test(xml)) add('UNSUPPORTED_EFFECT', '发现裁剪、旋转、翻转或复杂效果；本提案保留原图字节，但不承诺效果保真。');
    if (/<(?:[\w.-]+:)?absoluteAnchor\b/.test(xml)) add('ABSOLUTE_ANCHOR', '发现绝对定位图片；ExcelJS可能丢弃绝对锚点，须待指定归属或走完整OOXML转换。');
  }
  return issues;
}
