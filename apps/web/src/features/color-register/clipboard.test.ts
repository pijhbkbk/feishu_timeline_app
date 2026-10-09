import { describe, expect, it } from 'vitest';
import type { RegisterRow } from './client';
import { parseRegisterNotePaste, parseTsv, registerRowsToTsv } from './clipboard';

function row(id = 'color-one', note: string | null = null): RegisterRow {
  return { id, colorId: id, name: '合成颜色', formalCode: null, base: { id: 'base-one', name: '合成基地' }, manufacturer: null, paintType: null, boardCode: null, registerMonth: null, registerStatus: 'LISTED', productionApprovalStatus: 'UNKNOWN', note, revision: 3, currentStandardVersionId: null, sourceSummary: null };
}
function paste(id: string, version: string, note: string) {
  return `清单记录ID\t记录版本\t备注\r\n${id}\t${version}\t${note}`;
}

describe('color register clipboard boundary', () => {
  it('uses the immutable record identity and revision, never a name or note for matching', () => {
    expect(parseRegisterNotePaste(paste('color-one', '3', '仅用于展示'), [row()])).toEqual([{ id: 'color-one', expectedRevision: 3, note: '仅用于展示' }]);
    expect(() => parseRegisterNotePaste(paste('合成颜色', '3', '合成基地'), [row()])).toThrow('不是当前页');
    expect(() => parseRegisterNotePaste(paste('color-one', '2', '更新'), [row()])).toThrow('记录版本已变化');
    expect(() => parseRegisterNotePaste(paste('color-one', '3.0', '更新'), [row()])).toThrow('记录版本已变化');
  });
  it('quotes multiline tabs and quotes without discarding them', () => {
    const original = row('color-one', '包含\t制表符\n和"引号"');
    const decoded = parseTsv(registerRowsToTsv([original]));
    expect(decoded[1]?.at(-1)).toBe(original.note);
    expect(() => parseRegisterNotePaste(registerRowsToTsv([original]), [original])).toThrow('没有备注变更');
    expect(parseRegisterNotePaste(registerRowsToTsv([original]), [row()])[0]?.note).toBe(original.note);
  });
  it.each(['=HYPERLINK("https://example.invalid")', '+1', '-2', '@reference', '\t=1+1', "'原文单引号"])('exports risky spreadsheet text reversibly: %s', note => {
    const original = row('color-one', note);
    expect(parseTsv(registerRowsToTsv([original]))[1]?.at(-1)).toBe(`'${note}`);
    expect(parseRegisterNotePaste(registerRowsToTsv([original]), [row()])[0]?.note).toBe(note);
  });
  it('keeps literal user-pasted notes and distinguishes zero from blank', () => {
    expect(parseRegisterNotePaste(paste('color-one', '3', "'用户输入"), [row()])[0]?.note).toBe("'用户输入");
    expect(parseRegisterNotePaste(paste('color-one', '3', '0'), [row()])[0]?.note).toBe('0');
    expect(parseRegisterNotePaste(paste('color-one', '3', ''), [row('color-one', '旧备注')])[0]?.note).toBeNull();
    expect(() => parseRegisterNotePaste(paste('color-one', '3', ''), [row()])).toThrow('没有备注变更');
  });
  it('rejects duplicate IDs, ambiguous headers, invalid quoting and oversized notes', () => {
    expect(() => parseRegisterNotePaste(`${paste('color-one', '3', '甲')}\r\ncolor-one\t3\t乙`, [row()])).toThrow('重复引用');
    expect(() => parseRegisterNotePaste('清单记录ID\t记录版本\t备注\t备注\ncolor-one\t3\t甲\t乙', [row()])).toThrow('表头重复');
    expect(() => parseTsv('a\t"unclosed')).toThrow('未闭合');
    expect(() => parseTsv('"closed"tail')).toThrow('引号格式');
    expect(() => parseRegisterNotePaste(paste('color-one', '3', '字'.repeat(2001)), [row()])).toThrow('超过 2000');
    expect(() => parseTsv('字'.repeat(262145))).toThrow('超过 256 KB');
  });
  it('rejects extra/missing columns instead of silently shifting notes', () => {
    expect(() => parseRegisterNotePaste(`${paste('color-one', '3', '备注')}\t额外值`, [row()])).toThrow('列数');
    expect(() => parseRegisterNotePaste('清单记录ID\t记录版本\t备注\ncolor-one\t3', [row()])).toThrow('列数');
  });
});
