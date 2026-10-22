import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_XLSX_LIMITS, inspectCatalogArchive } from '../color-register/sheet-exchange';
import { normalizeSpreadsheetNamespaces } from './xlsx-namespaces';
import { readFreeWorkbook } from './xlsx';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
// Exact authorized artifact-tool synthetic failure: no real workbook or media.
// SHA256 e79742d69e1b53e12e1764c7a9b78078b57a107339b9904fd05d6b6266f9199b.
const ARTIFACT_FIXTURE = 'UEsDBBQAAAAIAC1HVV2dwzXC3QAAADABAAAPAAAAeGwvd29ya2Jvb2sueG1sjc9BTsMwEAXQq1izJ46rNIIoTjdsuuUGbjJurNqeyHapb0AlFvQELOEOSNyGIrgFoiC6ZTf6X/p60y6ys+wWQzTkJYiiBIa+p8H4tYRt0heXsOja3OwobFZEG5ad9bHJEsaUpobz2I/oVCxoQp+d1RScSrGgsOZxCqiGOCImZ/msLGvulPHwvXdK49/FvHIo4XjYv+8PH69Px8f7t5fnz7sHYKd+OUgQwEJjBgk3lahndaVW4mquKzHM4VcV/qMirU2P19RvHfr0wwpoVTLk42imCIx3LT8T+fn77gtQSwMEFAAAAAgALUdVXYsgl224AQAAMgYAAA0AAAB4bC9zdHlsZXMueG1sxZRPb+MgEMW/CuK+8Z9tqioKqbqRLPXSS/ewV2xjB2lgLCCVs59+ZcAOTVVt2kObi9+M/H4zJC9s70cF5EUYK1EzWqxySoRusJW6Z/Touh939H63HTfWnUA8H4RwZFSg7WZk9ODcsMky2xyE4naFg9Cjgg6N4s6u0PSZHYzgrZ1sCrIyz28zxaWmE1EfVaWcJQ0etWO0SJokPB5bRss8pyQg99gKRnNKst02W/yTq0N9Bv2kc8vv/Ze8cGC0KLxv3GiuRGjtuQHpcObNjiucD0ZyeM9Xh7ff2BsENMT0NaNV/FwDjiKcUwJcnlMCTM+BOyeMriQAifr3aRCMatRiIcaX/2vqDT8V5frDPosg27BXv0/Pe/NwW67vZl7iT/hR+JPWaFphLsIRmpMC0bnw3RnZH6J0OARRo3Oogm4l71FziJNnxCL9tEYAPE8B/9NdjBy7JIs+iXqREiDKgIpFGJQi5xEJff1Z+tidx7wPKK4A8GGA09NR1cJU/v/lbb5boU4rCXCufnmYr69dofymFcpvWqEMd9YX/xQxdEnefP4uAr30yXTrMPo0zYPXuUrja315vv13/wBQSwMEFAAAAAgALkdVXfpcAVkDAwAA2g0AABMAAAB4bC90aGVtZS90aGVtZTEueG1svVfbcpswFPwVRu8NN3PzhGQSx24f0mmnyQ/IIECNEB5Jjp2/7yBuAozjNHbsB0tiz9lF57DC17f7nGiviHFc0BCYVwbQEI2KGNM0BFuRfPPB7c01nIsM5UijMEchWGRQfP/9DLR9TiifwxBkQmzmus6jDOWQXxUbRPc5SQqWQ8GvCpbqMYM7TNOc6JZhuHoOMQVt3iVBOaKClwsRYU/RAbLyWvxilj/8jS8I014hCcEO07jYPaO9ABqBXCwIC4EhP0DTb671NoqIiWAlcCU/TWAdEb9YMpCl6zbSWFr+zOwYJIKIMXDpl98uo0TAKEK0lqOCTcc1fKsBK6hqeCB74Jn2IEBhsMcMgXtvzfoBElUNZ+MbXQXLB6cfIFHV0BkF3BnWfWD3AySqGrqjgNnyzrOW/QCJygimL2O46/m+28BbTFKQHwfxgesa3kOD72C60mpVAip6jfcrSXCEZN/l8G/BVgUVsspQYKqJtw1KYFQ2KCR4zbD2iNNMSB44R/AdQMSPAvQBZ47puwKOUB8hbek6Bl3dDLk1uZh8JBNMyJN4I+iRS3G8IDheYULkREa1pdhkC8Iawh4wZbAb8zpVyrVNwUNggMlc0kEwFdWa6zVPPZyTbf6ziOumN1s7gHMORXfBcBSfaBnkLOWqhhJ3sg7PntDR0Q112CfqkHdyshDf/LCQ4KgQXSkPwVSD5SnhzGq75REkKC4LVifolfUsJQ5mU3dkfXZrTygxz2CMmrzGlJKpZuu68AxFVqR4/mElQTAhpNyqSxRZH9sBof2Ztiv5vebu/sssNoyLB8izCicvtecrVWgCw/kCGqvcmcvR6MM9REmCIjGx0k0fuaizHLz8WXQ5KbYCsacs3mlrsmV/YBwCxzMdA2gx5qIpgBZj1rXP+P2iW4dkk8HayXsPbYWX45ZTESvlDKX357Xidbo6y3H1ftTAtabs1pt+Ei9wPgbKuaT4R+B/1FMrqzz3sanqUOVNGq09Ic++kNF2Xfl1hjps2dJjm9cxORv8gWpWbv4BUEsDBBQAAAAIAC5HVV0NHrnoZQAAAHMAAAAUAAAAeGwvc2hhcmVkU3RyaW5ncy54bWwFwVEKwyAMANCrSP5n3D7GkNqeRdq0CiYWkw2Pv/eWbXJzPxpauyR4+gCOZO9HlSvB187HB7Z1mVHV3OQmGmeCYnZHRN0LcVbfb5LJ7eyDs6nv40K9B+VDC5Fxw1cIb+RcBRyuf1BLAwQUAAAACAAuR1VdpCmjjDcCAABwBwAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbJ2Vz27TMBjAX8Xyfc3fFqiaTt1aYFInEEJwRFniNtbiuLLdJi+AqDbGdhkSCBXtwhGVG9LUt2kKvAWKk3YUuduaU/zZ/n2f/bNiN3YTEoIRYhzTyIFGRYcARR71cdR34FD0dh7C3WYjqceUHfMAIQESEka8njgwEGJQ1zTuBYi4vEIHKEpI2KOMuIJXKOtrfMCQ60uMhJqp6zWNuDiCWULZ+wqjmK9FgAc0fsKw38UR4g7UIchKH1F6nA0f+LJLazY0ZYrHsvpzBnzUc4eheEHjpwj3A+FAoyq5pO7RUAIeDQHB2a4hIG4ivzH2ReBAU4cgwL6PIlnOG3JByet8zLhJk+NmgZvlcKvArXK4XeB2Obxa4NUtcO3GoZTedoWbBYzGgMlJmW+ztoRXJyAP3svmtAwIuNyzcCAXTI6MmvOfn9OTq8WX8fx6lpUZ5cVW2J4a+z37lk5O0w9fFx/fqbD9DdjV+18/rtPJqYppq5n0++TPp7fp+XRxOVVhnQ3Y2eV8drYGaFLYP97Mwpt9mzdTpjf+S2/qZm1Hf6RUpibSi/FifJGLaymdqbnDZ+1O902787J10FVqyzFbYvmfPmoaulLVhpWdT2/3ZN3Hk7W1J+tOT3tKT1Y5T5bKk6n0ZJXzZN/Hk721J/tOT/tKT3Y5Tzm27qmq1LRhYRs0Ld+P5eU1cPvo0GV9HHEQop5woF55AAHLlcm2oAPZqkJwRIWgZBkFyPURyyILgh6lYhXkt+Xq8Wz+BVBLAwQUAAAAAAAuR1VdJDpwligBAAAoAQAACwAAAF9yZWxzLy5yZWxz77u/PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48UmVsYXRpb25zaGlwcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzIj48UmVsYXRpb25zaGlwIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvb2ZmaWNlRG9jdW1lbnQiIFRhcmdldD0iL3hsL3dvcmtib29rLnhtbCIgSWQ9IlI0OTI1YzU0NjNmNTI0N2M1IiAvPjwvUmVsYXRpb25zaGlwcz5QSwMEFAAAAAgALkdVXf4PsEwQAQAA8gIAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc7WSTU7DMBBGr2J5TxxHjtugpt10w7b0AoMzjqP6J7JdSM/GgiNxBURBKEEs2HQzi2+kpzef5v31bbObnCXPGNMQfEt5UVKCXoVu8H1Lz1nfreluuzmghTwEn8wwJjI561NLTc7jPWNJGXSQijCin5zVITrIqQixZyOoE/TIqrKULM4ZdMkkx8uI/yEGrQeF+6DODn3+A8xSvlhMlBwh9phbyib7nRWTs5Q8dC096EZyrPhalWol6lJTwm4mlA06XPpco6/JZ1aSN9iJUjUChaigu6VVMhCxe8xx8P3vtuarmR5IqeQKoOFSCxDNLfVeQjwlg5iXaj/x5wGIed6e4LKSAp54U2vBu/qqxxafu/0AUEsDBBQAAAAIAC5HVV2NgtmpFgEAAFMDAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2TQU7DMBBFrxJ5i2qnLBBCSbsAtoAEF7CcSWLVHlueaUjPxoIjcQVUB0WAkCLUbjyb8Xv/L+bj7b3ajt4VAySyAWuxlqUoAE1oLHa12HO7uhbbTfVyiEDF6B1SLXrmeKMUmR68Jhki4OhdG5LXTDKkTkVtdroDdVmWV8oEZEBe8ZEhNtUdtHrvuLgfGXDSjt6J4nbaO6pqoWN01mi2AdWAzS/JKrStNdAEs/eALCkm0A31AOydzFN6bfEig9WfzgSO/if9aiUTuLxDvY00Kx4HSMk2UDzpxA/aQy3U6BTxwQHJMzfM0CU19+BhetcnB8iYxbK9TtA8c7LYnb3zd/ZSkNeQdvkjqTxO7/8zzMyfg6h8IptPUEsBAhQDFAAAAAgALUdVXZ3DNcLdAAAAMAEAAA8AAAAAAAAAAAAAAKSBAAAAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIAC1HVV2LIJdtuAEAADIGAAANAAAAAAAAAAAAAACkgQoBAAB4bC9zdHlsZXMueG1sUEsBAhQDFAAAAAgALkdVXfpcAVkDAwAA2g0AABMAAAAAAAAAAAAAAKSB7QIAAHhsL3RoZW1lL3RoZW1lMS54bWxQSwECFAMUAAAACAAuR1VdDR656GUAAABzAAAAFAAAAAAAAAAAAAAApIEhBgAAeGwvc2hhcmVkU3RyaW5ncy54bWxQSwECFAMUAAAACAAuR1VdpCmjjDcCAABwBwAAGAAAAAAAAAAAAAAApIG4BgAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAhQDFAAAAAAALkdVXSQ6cJYoAQAAKAEAAAsAAAAAAAAAAAAAAKSBJQkAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgALkdVXf4PsEwQAQAA8gIAABoAAAAAAAAAAAAAAKSBdgoAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgALkdVXY2C2akWAQAAUwMAABMAAAAAAAAAAAAAAKSBvgsAAFtDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAgACAADAgAABQ0AAAAA';
const artifactBytes = () => new Uint8Array(Buffer.from(ARTIFACT_FIXTURE, 'base64'));
const part = (xml: string) => ({ 'xl/workbook.xml': strToU8(xml) });
const normalize = (xml: string) => strFromU8(normalizeSpreadsheetNamespaces(part(xml))['xl/workbook.xml']!);
const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mgAAAAASUVORK5CYII='), c => c.charCodeAt(0));

describe('SpreadsheetML namespace compatibility', () => {
  it('imports the original artifact-tool bytes and preserves all twenty values and header style', async () => {
    const bytes = artifactBytes(), before = new Uint8Array(bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('e79742d69e1b53e12e1764c7a9b78078b57a107339b9904fd05d6b6266f9199b');
    const parsed = await readFreeWorkbook(bytes, 'a14-synthetic-production.xlsx', crypto.randomUUID());
    expect(bytes).toEqual(before);
    expect(parsed.snapshot.sheetOrder).toHaveLength(1);
    const sheet = parsed.snapshot.sheets[parsed.snapshot.sheetOrder[0]!]!;
    expect(sheet.name).toBe('合成车型产量');
    const values = [0, 1, 2, 3].map(row => [0, 1, 2, 3, 4].map(col => sheet.cellData?.[row]?.[col]?.v));
    expect(values).toEqual([
      ['业务月份', '车型原文', '行类型', '实际台数', '单位'],
      ['2026-09', '合成车型A', 'MODEL_DETAIL', 10, '台'],
      ['2026-09', '合成车型B', 'MODEL_DETAIL', 12, '台'],
      ['2026-09', '合成车型C', 'MODEL_DETAIL', 5, '台'],
    ]);
    expect(sheet.cellData?.[0]?.[0]?.s).toMatchObject({ bl: 1, fs: 11, cl: { rgb: '#FFFFFF' }, bg: { rgb: '#4A6258' } });
    expect(parsed.images).toEqual([]);
  });

  it('leaves already canonical XML and all media/relationship parts byte-identical', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('原无前缀'); sheet.getCell('A1').value = '保留';
    const image = book.addImage({ buffer: pixel as never, extension: 'png' });
    sheet.addImage(image, { tl: { col: 1, row: 1 }, ext: { width: 40, height: 20 } });
    const bytes = new Uint8Array(await book.xlsx.writeBuffer()), files = inspectCatalogArchive(bytes);
    const normalized = normalizeSpreadsheetNamespaces(files);
    for (const path of Object.keys(files)) expect(normalized[path]).toBe(files[path]);
    const prefixed = { ...files };
    for (const path of ['xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']) {
      prefixed[path] = strToU8(strFromU8(files[path]!).replace(`xmlns="${MAIN}"`, `xmlns:x="${MAIN}"`).replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2'));
    }
    const copy = normalizeSpreadsheetNamespaces(prefixed);
    for (const path of Object.keys(files).filter(path => path.endsWith('.rels') || /\/media\/|\/drawings\//.test(path))) expect(copy[path]).toBe(prefixed[path]);
    const parsed = await readFreeWorkbook(zipSync(prefixed), 'prefixed-image.xlsx', crypto.randomUUID());
    expect(parsed.images).toHaveLength(1); expect(parsed.images[0]!.bytes).toEqual(pixel);
    expect(parsed.images[0]!.anchor).toMatchObject({ kind: 'oneCell', width: 40, height: 20 });
  });

  it('resolves scoped aliases but preserves literal text, attribute values, comments, CDATA and relationship attributes', () => {
    const xml = `<x:workbook xmlns:x="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:other="urn:kept"><!-- <x:sheets/> --><x:sheets><y:sheet xmlns:y="${MAIN}" r:id="rId1" name="x:sheet &amp; &quot; text" other:label="<not-a-tag escaped='&lt;x:a&gt;'"/></x:sheets></x:workbook>`;
    // Literal '<' in an attribute is invalid XML, not something to repair.
    expect(() => normalize(xml)).toThrow('XML');
    const valid = xml.replace('<not-a-tag', '&lt;not-a-tag').replace('</x:sheets>', '<x:ext><![CDATA[<x:keep a="x:text">]]></x:ext></x:sheets>');
    const result = normalize(valid);
    expect(result).toContain('<!-- <x:sheets/> -->');
    expect(result).toContain('<![CDATA[<x:keep a="x:text">]]>');
    expect(result).toContain('r:id="rId1" name="x:sheet &amp; &quot; text" other:label="&lt;not-a-tag escaped=\'&lt;x:a&gt;\'"');
    expect(result).toContain('xmlns:other="urn:kept"');
    expect(result).toContain('<sheet xmlns:y=');
    expect(result).not.toContain('<y:sheet');
  });

  it('accepts a numeric character reference in the confirmed namespace URI without changing its attribute bytes', () => {
    const encoded = MAIN.replace('/main', '&#47;main');
    expect(normalize(`<x:workbook xmlns:x="${encoded}"><x:sheets/></x:workbook>`)).toContain(`xmlns:x="${encoded}"`);
  });

  it.each([
    `<x:workbook xmlns:x="urn:unknown"><x:sheets/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><x:sheets xmlns:x="urn:rebound"/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><z:sheets/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><sheets/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns="urn:foreign"><x:sheets/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:r="urn:fake"><x:sheets r:id="rId1"/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:rel="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets rel:id="rId1"/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><x:sheets foo:id="x"/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:a="urn:same" xmlns:b="urn:same" a:id="1" b:id="2"/>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:a="urn:other" id="1" a:id="2"/>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:xml="urn:fake"/>`,
    `<x:workbook xmlns:x="${MAIN}" xmlns:unused="&toString;"/>`,
    `<x:workbook xmlns:x="${MAIN}"><x:extLst><foreign:sheet xmlns:foreign="urn:unknown"/></x:extLst></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><known:sheets xmlns:known="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"/></x:workbook>`,
    `<x:workbook xmlns:x="${MAIN}"><x:sheets></x:workbook>`,
    `<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///not-read">]><x:workbook xmlns:x="${MAIN}"/>`,
  ])('rejects malformed, unknown, rebound or unresolved XML instead of washing namespaces: %s', xml => {
    expect(() => normalize(xml)).toThrow('XML');
  });

  it('bounds depth, attributes, entries and aggregate normalization expansion', () => {
    expect(() => normalize(`<x:workbook xmlns:x="${MAIN}">${'<x:a>'.repeat(128)}${'</x:a>'.repeat(128)}</x:workbook>`)).toThrow('超限');
    expect(() => normalize(`<x:workbook xmlns:x="${MAIN}" ${Array.from({ length: 256 }, (_, i) => `a${i}="x"`).join(' ')}/>`)).toThrow('超限');
    expect(() => normalizeSpreadsheetNamespaces(Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`part-${i}`, new Uint8Array()])))).toThrow('超限');
    const xml = strToU8(`<x:workbook xmlns:x="${MAIN}"/>`);
    expect(() => normalizeSpreadsheetNamespaces({ 'xl/workbook.xml': xml, 'xl/media/padding': new Uint8Array(CATALOG_XLSX_LIMITS.expandedBytes - xml.length) })).toThrow('超限');
  });

  it('rejects an unknown workbook namespace before invoking ExcelJS', async () => {
    const files = unzipSync(artifactBytes());
    files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']!).replace(MAIN, 'urn:unknown'));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load');
    try { await expect(readFreeWorkbook(zipSync(files), 'wrong-namespace.xlsx', crypto.randomUUID())).rejects.toThrow('XML'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it('rejects a qualified attribute hiding an oversized allocation index before ExcelJS', async () => {
    const files = unzipSync(artifactBytes());
    files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']!).replace(/<x:worksheet\b/, '<x:worksheet xmlns:other="urn:other"').replace(/<x:sheetData>/, '<x:cols><x:col min="1" max="1000000000" other:max="1"/></x:cols><x:sheetData>'));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load');
    try { await expect(readFreeWorkbook(zipSync(files), 'attribute-confusion.xlsx', crypto.randomUUID())).rejects.toThrow('XML'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it('keeps child cells visible to bounds checks when a row attribute has the same local name', async () => {
    const files = unzipSync(artifactBytes()), path = 'xl/worksheets/sheet1.xml';
    const xml = strFromU8(files[path]!).replace(/<x:worksheet\b/, '<x:worksheet xmlns:other="urn:other"').replace(/<x:row r="1"/, '<x:row r="1" other:c=""').replace('s="3"', 's="999999999"');
    expect(xml).toContain('other:c=""'); expect(xml).toContain('s="999999999"'); files[path] = strToU8(xml);
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load');
    try { await expect(readFreeWorkbook(zipSync(files), 'child-confusion.xlsx', crypto.randomUUID())).rejects.toThrow('超限'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it('does not treat a foreign coordinate attribute as an unqualified cell address', async () => {
    const files = unzipSync(artifactBytes()), path = 'xl/worksheets/sheet1.xml';
    files[path] = strToU8(strFromU8(files[path]!).replace(/<x:worksheet\b/, '<x:worksheet xmlns:other="urn:other"').replace('<x:c r="A1"', '<x:c other:r="A1"'));
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load');
    try { await expect(readFreeWorkbook(zipSync(files), 'foreign-coordinate.xlsx', crypto.randomUUID())).rejects.toThrow('缺少坐标'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });

  it.each(['cols', 'sheetData', 'cellXfs', 'f'])('rejects duplicate %s singleton nodes before ExcelJS', async node => {
    const files = unzipSync(artifactBytes()), path = node === 'cellXfs' ? 'xl/styles.xml' : 'xl/worksheets/sheet1.xml';
    const xml = strFromU8(files[path]!);
    files[path] = strToU8(node === 'f' ? xml.replace('<x:v>', '<x:f>1</x:f><x:f>2</x:f><x:v>') : xml.replace(new RegExp(`(<x:${node}\\b[\\s\\S]*?<\\/x:${node}>)`), '$1$1'));
    expect(strFromU8(files[path]!)).not.toBe(xml);
    const load = vi.spyOn(Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), 'load');
    try { await expect(readFreeWorkbook(zipSync(files), 'duplicate-node.xlsx', crypto.randomUUID())).rejects.toThrow('单值节点'); expect(load).not.toHaveBeenCalled(); }
    finally { load.mockRestore(); }
  });
});
