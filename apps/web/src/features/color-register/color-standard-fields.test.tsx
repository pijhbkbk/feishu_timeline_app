import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColorStandardFields, colorStandardDraftFromData, emptyColorStandardDraft, technicalDataFromDraft } from './color-standard-fields';

describe('color standard editable fields', () => {
  it('keeps all angles, explicit zero, missing values and original date/control text', () => {
    const draft = colorStandardDraftFromData({ measurements: [{ angle: 15, l: 0, a: null, b: '-0.10' }, { angle: '45°', l: 72.3, a: 1, b: null }], conditions: 'D65 / 10°', originalControlLimits: '±0.8', measurementDate: '2024年3月', issueDate: null });
    const payload = technicalDataFromDraft(draft);
    expect(payload.measurements).toEqual([{ angle: '15', l: '0', a: null, b: '-0.10', originalControlLimits: null }, { angle: '45°', l: '72.3', a: '1', b: null, originalControlLimits: null }]);
    expect(payload.measurementDate).toBe('2024年3月');
    expect(payload.originalControlLimits).toBe('±0.8');
    expect(payload.issueDate).toBeNull();
  });
  it('does not silently drop an empty measurement row', () => {
    expect(technicalDataFromDraft(emptyColorStandardDraft()).measurements).toEqual([{ angle: null, l: null, a: null, b: null, originalControlLimits: null }]);
  });
  it('does not silently truncate source measurements when they exceed the write limit', () => {
    const rows = Array.from({ length: 33 }, (_, index) => ({ angle: String(index), l: null, a: null, b: null }));
    expect(technicalDataFromDraft(colorStandardDraftFromData({ measurements: rows })).measurements).toHaveLength(33);
  });
  it('provides independently labelled angle inputs and required correction reason', () => {
    const html = renderToStaticMarkup(<ColorStandardFields value={emptyColorStandardDraft()} onChange={() => undefined} requireChangeSummary />);
    expect(html).toContain('第1行L');
    expect(html).toContain('第1行a');
    expect(html).toContain('测量条件');
    expect(html).toContain('原控制限');
    expect(html).toContain('更正原因');
    expect(html).toContain('required');
  });
});
