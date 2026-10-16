import type ExcelJS from 'exceljs';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { IMAGE_LIMITS, classifyImage, mimeFromBytes, inspectUnsupportedImageParts, type EmbeddedImage, type ImageAnchor, type ImageImportOptions, type ImageImportResult, type ImageIssue, type ImageMarker } from './xlsx-images';

/** Browser-safe extraction of the source OOXML drawing inventory. Adapted from
 * Personal Sheets src/formats/xlsx-images.ts at 15ea9714645331a7a2229967a3ba5de4badf8004.
 * Input MUST come from the existing bounded/CRC-checked archive inspector. */
type Xml = Record<string, unknown>;
function object(value: unknown): Xml { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Xml : {}; }
function at(value: unknown, ...path: string[]): unknown { let current = value; for (const key of path) current = object(current)[key]; return current; }
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false });
const ordered = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, processEntities: false });
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
interface Relation { type: string; target: string; external: boolean }
export interface RawImageImportResult extends ImageImportResult {
  inventory: { rawPictureCount: number; retainedImageCount: number; excelJsImageCount: number; unrepresentedPictureCount: number; countMismatch: boolean };
}

function xml(files: Readonly<Record<string, Uint8Array>>, part: string): { data: Xml; source: string } {
  const bytes = files[part]; if (!bytes) throw new Error(`缺少 XML 部件：${part}`);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('不支持带 DTD 或实体声明的图片部件。');
  if (XMLValidator.validate(source) !== true) throw new Error(`XML 部件损坏：${part}`);
  return { data: parser.parse(source) as Xml, source };
}
/** Deliberately avoid URL fetch / Node path. Relationships may traverse ../
 * within the OOXML package; escaping the package or xl/ root is rejected. */
function resolvePart(from: string, target: string): string {
  if (!target || /[\\\0?#]/.test(target) || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) throw new Error('图片关系路径无效。');
  let decoded: string; try { decoded = decodeURIComponent(target); } catch { throw new Error('图片关系路径编码无效。'); }
  if (decoded !== target && /[\\\0?#]/.test(decoded)) throw new Error('图片关系路径编码无效。');
  const stack = decoded.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const item of decoded.split('/')) {
    if (!item || item === '.') continue;
    if (item === '..') { if (!stack.length) throw new Error('图片关系路径越界。'); stack.pop(); }
    else stack.push(item);
  }
  const result = stack.join('/'); if (!result.startsWith('xl/')) throw new Error('图片关系路径越界。');
  return result;
}
function relations(files: Readonly<Record<string, Uint8Array>>, part: string): Map<string, Relation> {
  const segments = part.split('/'), name = segments.pop()!;
  const relationshipPart = [...segments, '_rels', `${name}.rels`].join('/');
  const result = new Map<string, Relation>(); if (!files[relationshipPart]) return result;
  for (const item of array<Xml>(at(xml(files, relationshipPart).data, 'Relationships', 'Relationship') as Xml | Xml[] | undefined)) {
    const id = String(item['@_Id'] ?? ''), external = item['@_TargetMode'] === 'External';
    if (!id || result.has(id)) throw new Error('绘图关系 ID 缺失或重复。');
    const target = String(item['@_Target'] ?? '');
    result.set(id, { type: String(item['@_Type'] ?? ''), external, target: external ? target : resolvePart(part, target) });
  }
  return result;
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const result = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(result) || result < 0 || result > max) throw new Error('图片位置或尺寸不是有效非负数。');
  return result;
}
function marker(value: Xml | undefined): ImageMarker {
  if (!value) throw new Error('缺少图片行列锚点。');
  const row = number(value.row, IMAGE_LIMITS.rows - 1), column = number(value.col, IMAGE_LIMITS.columns - 1);
  if (!Number.isInteger(row) || !Number.isInteger(column)) throw new Error('图片行列锚点必须为整数。');
  return { row, column, rowOffset: number(value.rowOff ?? 0) / IMAGE_LIMITS.emuPerPixel, columnOffset: number(value.colOff ?? 0) / IMAGE_LIMITS.emuPerPixel };
}
function anchor(kind: string, value: Xml): ImageAnchor {
  if (kind === 'absoluteAnchor') {
    const left = number(at(value, 'pos', '@_x')) / IMAGE_LIMITS.emuPerPixel, top = number(at(value, 'pos', '@_y')) / IMAGE_LIMITS.emuPerPixel;
    const width = number(at(value, 'ext', '@_cx')) / IMAGE_LIMITS.emuPerPixel, height = number(at(value, 'ext', '@_cy')) / IMAGE_LIMITS.emuPerPixel;
    if (!width || !height) throw new Error('图片显示尺寸必须大于零。');
    // Synthetic zero marker preserves absolute content-space pixels. It is not
    // used to infer an owner. Explicit assignment must choose a new row anchor.
    return { kind: 'absolute', from: { row: 0, column: 0, rowOffset: top, columnOffset: left }, width, height };
  }
  const from = marker(object(value.from));
  if (kind === 'twoCellAnchor') return { kind: value['@_editAs'] === 'absolute' ? 'absolute' : value['@_editAs'] === 'oneCell' ? 'oneCell' : 'twoCell', from, to: marker(object(value.to)) };
  const width = number(at(value, 'ext', '@_cx')) / IMAGE_LIMITS.emuPerPixel, height = number(at(value, 'ext', '@_cy')) / IMAGE_LIMITS.emuPerPixel;
  if (!width || !height) throw new Error('图片显示尺寸必须大于零。');
  return { kind: 'oneCell', from, width, height };
}
function unsupportedAppearance(picture: Xml): boolean {
  const shape = object(picture.spPr), transform = object(shape.xfrm), fill = object(picture.blipFill);
  const nonzero = (value: Xml | undefined) => value && Object.entries(value).some(([key, item]) => key.startsWith('@_') && Number(item) !== 0);
  return Number(transform['@_rot'] ?? 0) !== 0 || ['1', 'true'].includes(String(transform['@_flipH'])) || ['1', 'true'].includes(String(transform['@_flipV'])) || Boolean(nonzero(object(fill.srcRect)) || nonzero(object(at(fill, 'stretch', 'fillRect')))) || fill.tile !== undefined || shape.custGeom !== undefined || (at(shape, 'prstGeom', '@_prst') !== undefined && at(shape, 'prstGeom', '@_prst') !== 'rect') || shape.effectDag !== undefined || shape.scene3d !== undefined || shape.sp3d !== undefined || Object.keys(object(shape.effectLst)).length > 0;
}

/** Raw drawing objects are authoritative for image inventory. ExcelJS's parsed
 * object count is diagnostic only; never silently use it as the success count. */
export function readRawEmbeddedImages(files: Readonly<Record<string, Uint8Array>>, workbook: ExcelJS.Workbook, options: ImageImportOptions): RawImageImportResult {
  if (!options.archiveInspected) throw new Error('先执行现有 ZIP 大小、路径、CRC 与实际输出预算检查，再读取图片。');
  const archiveIssues = inspectUnsupportedImageParts(files).filter(issue => issue.code !== 'ABSOLUTE_ANCHOR');
  const result: RawImageImportResult = { images: [], issues: [...archiveIssues, ...options.archiveIssues ?? []], counts: { ready: 0, pending: 0, errors: 0, unsupported: archiveIssues.length }, inventory: { rawPictureCount: 0, retainedImageCount: 0, excelJsImageCount: workbook.worksheets.reduce((n, sheet) => n + sheet.getImages().length, 0), unrepresentedPictureCount: 0, countMismatch: false } };
  const workbookPart = 'xl/workbook.xml', wbRelations = relations(files, workbookPart);
  for (const sheetInfo of array<Xml>(at(xml(files, workbookPart).data, 'workbook', 'sheets', 'sheet') as Xml | Xml[] | undefined)) {
    const sheetId = String(sheetInfo['@_sheetId']), sheetName = String(sheetInfo['@_name']);
    const sheet = workbook.getWorksheet(Number(sheetId));
    const sheetRelation = wbRelations.get(String(sheetInfo['@_id']));
    if (!sheetRelation || sheetRelation.external || !sheetRelation.type.endsWith('/worksheet')) { result.issues.push({ code: 'SHEET_RELATION', message: '工作表关系无效，无法核对其图片。', sheet: sheetName }); continue; }
    const sheetPart = sheetRelation.target, worksheet = object(xml(files, sheetPart).data.worksheet);
    const sheetRelations = relations(files, sheetPart);
    for (const link of array<Xml>(worksheet.drawing as Xml | Xml[] | undefined)) {
      const relationship = sheetRelations.get(String(link['@_id']));
      if (!relationship || relationship.external || !relationship.type.endsWith('/drawing')) { result.issues.push({ code: 'DRAWING_RELATION', message: '图片绘图关系缺失或外链，不访问外部地址。', sheet: sheetName }); continue; }
      const part = relationship.target, parsed = xml(files, part), drawing = object(parsed.data.wsDr), pictureRelations = relations(files, part);
      if (!parsed.data.wsDr) { result.issues.push({ code: 'DRAWING_ROOT', message: '无法识别图片绘图根节点。', part, sheet: sheetName }); continue; }
      result.inventory.rawPictureCount += (parsed.source.match(/<(?:[\w.-]+:)?pic\b/g) ?? []).length;
      if (result.inventory.rawPictureCount > IMAGE_LIMITS.images) throw new Error('图片实例超过 1000 个上限。');
      const order = ((ordered.parse(parsed.source) as Xml[]).find(node => node.wsDr)?.wsDr ?? []) as Xml[];
      const indexes = new Map<string, number>();
      for (const node of order) {
        const kind = Object.keys(node).find(key => key !== ':@' && key !== '#text'); if (!kind) continue;
        const index = indexes.get(kind) ?? 0; indexes.set(kind, index + 1);
        const geometry = array<Xml>(drawing[kind] as Xml | Xml[] | undefined)[index]; if (!geometry) continue;
        // A grouping object is explicitly reported by archive inspection. Only
        // its direct picture children have unambiguous source geometry here.
        for (const [pictureIndex, picture] of array<Xml>(geometry.pic as Xml | Xml[] | undefined).entries()) {
          const imageKey = `${sheetId}:${part}:${kind}:${index}:${pictureIndex}`;
          const itemIssues: ImageIssue[] = [];
          const issue = (code: string, message: string) => itemIssues.push({ code, message, part, sheet: sheetName, imageKey });
          const blip = object(at(picture, 'blipFill', 'blip')), media = pictureRelations.get(String(blip['@_embed'] ?? blip['@_link']));
          if (!media || media.external || blip['@_link'] || !media.type.endsWith('/image')) {
            issue('EXTERNAL_OR_MISSING_IMAGE', '图片外链或媒体关系缺失；没有原图字节，须手动上传。'); result.issues.push(...itemIssues); continue;
          }
          const extension = media.target.split('.').pop()?.toLowerCase();
          if (!['png', 'jpg', 'jpeg'].includes(extension ?? '')) { issue('UNSUPPORTED_IMAGE_FORMAT', '此图片不是 PNG/JPEG；请转换后手动上传。'); result.issues.push(...itemIssues); continue; }
          const image: EmbeddedImage = { imageKey, sheetId, sheetName, sourceMediaId: media.target, bytes: new Uint8Array(), mime: 'image/png', anchor: null, occupiedRows: null, target: null, status: 'error', issues: itemIssues };
          try {
            const original = files[media.target]; if (!original) throw new Error('归档缺少原始图片字节。');
            image.mime = mimeFromBytes(original, extension); image.bytes = new Uint8Array(original);
            // Geometry failure never discards valid common image bytes.
            try { image.anchor = anchor(kind, geometry); } catch (cause) { issue('ANCHOR_UNRESOLVED', cause instanceof Error ? cause.message : '图片锚点缺失。'); }
            if (unsupportedAppearance(picture)) issue('UNSUPPORTED_APPEARANCE', '原图已保留；裁剪、旋转或复杂效果不能保真，请预览原图并确认转换及归属。');
            if (!sheet) { image.status = 'pending'; issue('SHEET_UNRESOLVED', 'ExcelJS 未读取该工作表；原图保留，请指定目标记录。'); }
            else classifyImage(image, sheet, options);
          } catch (cause) { issue('INVALID_IMAGE', cause instanceof Error ? cause.message : '图片字节无效。'); image.status = 'error'; }
          result.images.push(image);
        }
      }
    }
  }
  result.inventory.retainedImageCount = result.images.length;
  result.inventory.unrepresentedPictureCount = result.inventory.rawPictureCount - result.images.length;
  result.inventory.countMismatch = result.inventory.rawPictureCount !== result.inventory.excelJsImageCount;
  if (result.inventory.countMismatch) result.issues.push({ code: 'IMAGE_COUNT_MISMATCH', message: `原始绘图含 ${result.inventory.rawPictureCount} 个图片实例，ExcelJS 读取 ${result.inventory.excelJsImageCount} 个。以原始清单预览，未识别项必须处理，不能宣称全部成功。` });
  for (const image of result.images) result.counts[image.status === 'ready' ? 'ready' : image.status === 'pending' ? 'pending' : 'errors']++;
  result.counts.unsupported = result.issues.filter(issue => /UNSUPPORTED|EXTERNAL|CELL_IMAGE|IMAGE_FORMULA|BACKGROUND|RELATION|ROOT/.test(issue.code)).length;
  return result;
}
