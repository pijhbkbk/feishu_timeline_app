import { zipSync } from 'fflate';
import { assertPreparedBusinessPreview, type BusinessApplyPreview } from './business-apply';
import { BUSINESS_MAPPING_LIMITS, readBusinessMappingCapture } from './business-mapping';

const encoder = new TextEncoder();
const PREVIEW_BYTES = 24 * 1024 * 1024;
const TOTAL_BYTES = 32 * 1024 * 1024;
function bytes(text: string, maximum: number): Uint8Array<ArrayBuffer> {
  const result = encoder.encode(text);
  if (result.length > maximum) throw new Error('本次映射依据超过导出大小上限，请缩小映射范围后重新预览。');
  return result;
}
async function sha(data: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Local download only. This archive neither authorizes nor replays business commands. */
export async function exportMappingEvidence(
  preview: BusinessApplyPreview,
  capturedOwner: { actorId: string; workbookId: string },
  isCurrent: () => boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  const guard = () => {
    if (!isCurrent()) throw new Error('账号、工作簿或预览已变化，本次导出已取消。');
  };
  guard();
  assertPreparedBusinessPreview(preview);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(capturedOwner.actorId) || capturedOwner.workbookId !== preview.mapping.binding.workbookId) {
    throw new Error('映射依据的账号或工作簿身份不一致。');
  }
  const owner = { actorId: capturedOwner.actorId, workbookId: capturedOwner.workbookId };
  const capture = readBusinessMappingCapture(preview.mapping);
  const source = bytes(capture.sourceJSON, BUSINESS_MAPPING_LIMITS.snapshotBytes);
  const mapping = bytes(capture.mappingJSON, 64 * 1024);
  const previewJSON = JSON.stringify(preview);
  const previewBytes = bytes(previewJSON, PREVIEW_BYTES);
  const before = await Promise.all([sha(source), sha(mapping), sha(previewBytes)]);
  guard();
  if (before[0] !== preview.mapping.binding.fullJSONHash || before[1] !== preview.mapping.binding.mappingHash) {
    throw new Error('来源原文与预览摘要不一致，未生成导出文件。');
  }
  const unchanged = readBusinessMappingCapture(preview.mapping);
  const after = await Promise.all([
    sha(bytes(unchanged.sourceJSON, BUSINESS_MAPPING_LIMITS.snapshotBytes)),
    sha(bytes(unchanged.mappingJSON, 64 * 1024)),
    sha(bytes(JSON.stringify(preview), PREVIEW_BYTES)),
  ]);
  guard();
  if (before.some((value, index) => value !== after[index])) throw new Error('捕获内容在导出期间发生变化，未生成导出文件。');
  const binding = bytes(JSON.stringify({
    format: 'free-workbook-mapping-evidence-v1', capturedOwner: owner,
    exportedAt: new Date().toISOString(), binding: preview.mapping.binding,
    checks: { sourceBefore: before[0], sourceAfter: after[0], mappingBefore: before[1], mappingAfter: after[1], previewBefore: before[2], previewAfter: after[2] },
    preview,
    scope: 'Captured source, mapping choices and all displayed plans. Does not include the full business context or authorize command replay. sourceSnapshotHash is the opaque server version hash, not the source.json byte hash.',
  }), PREVIEW_BYTES);
  if (source.length + mapping.length + binding.length > TOTAL_BYTES) throw new Error('映射依据总大小超过上限，请缩小映射范围。');
  const bindingHash = await sha(binding);
  guard();
  const checksums = encoder.encode(`${before[0]}  source.json\n${before[1]}  mapping.json\n${bindingHash}  binding.json\n`);
  // Store entries without costly synchronous compression; all paths and sizes are bounded.
  const archive = zipSync({ 'source.json': source, 'mapping.json': mapping, 'binding.json': binding, SHA256SUMS: checksums }, { level: 0 });
  guard();
  return new Uint8Array(archive);
}
