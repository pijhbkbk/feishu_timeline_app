import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { inspectCatalogArchive } from './sheet-exchange';

// Copy beside sheet-exchange.ts to run. All input is generated in memory;
// this regression has no real workbooks, credentials, network or database IO.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function forgedExpandedLength() {
  const payload = new Uint8Array(1024 * 1024);
  // The output is deliberately repetitive: 1 MiB expanded but only a few KiB compressed.
  payload.fill(65);
  const name = 'xl/synthetic-size-probe.bin';
  const prefix = payload.subarray(0, 64);
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook/>'),
    [name]: payload,
  }, { level: 9 });
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  // zipSync emits no archive comment, so EOCD is the final 22 bytes.
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  let patched = false;
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(position, true)).toBe(0x02014b50);
    const length = view.getUint16(position + 28, true);
    const extra = view.getUint16(position + 30, true);
    const comment = view.getUint16(position + 32, true);
    const entryName = new TextDecoder().decode(archive.subarray(position + 46, position + 46 + length));
    if (entryName === name) {
      const local = view.getUint32(position + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      expect(view.getUint16(position + 10, true)).toBe(8);
      expect(view.getUint16(position + 8, true) & 8).toBe(0);
      const prefixCrc = crc32(prefix);
      // Keep the genuine compressed bytes and compressed length. Lie consistently
      // in BOTH directory and local headers about the expanded size and CRC.
      view.setUint32(position + 24, prefix.length, true);
      view.setUint32(position + 16, prefixCrc, true);
      view.setUint32(local + 22, prefix.length, true);
      view.setUint32(local + 14, prefixCrc, true);
      patched = true;
    }
    position += 46 + length + extra + comment;
  }
  expect(patched).toBe(true);
  return { archive, name, prefix, actualExpandedLength: payload.length };
}

describe('XLSX actual inflation limit regression', () => {
  it('rejects a complete deflate stream that exceeds its forged declared length despite matching prefix CRC', () => {
    const { archive, name, prefix, actualExpandedLength } = forgedExpandedLength();
    expect(archive.length).toBeLessThan(8192);
    expect(actualExpandedLength).toBe(1024 * 1024);
    // Evidence for the old validation hole: unzipSync uses a fixed output buffer
    // from the forged declaration, so its apparent output and CRC look valid.
    const truncated = unzipSync(archive)[name]!;
    expect(truncated).toEqual(prefix);
    expect(crc32(truncated)).toBe(crc32(prefix));
    // The inspected implementation must count ACTUAL stream output, rather than
    // trusting the fixed-size unzipSync result. The old implementation fails here.
    expect(() => inspectCatalogArchive(archive)).toThrow();
  });
});
