import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReviewStandardSelect } from './review-standard-select';
import { reviewStandardLabel } from '../lib/review-standard-version';
const v1 = { id: 'version-v1', colorId: 'color-sd', versionNo: 1, boardCode: 'SD-01' };
const v2 = { ...v1, id: 'version-v2', versionNo: 2 };
describe('review standard selection', () => {
  it('requires explicit selection instead of choosing the latest version', () => {
    const html = renderToStaticMarkup(<ReviewStandardSelect value="" onChange={vi.fn()} options={[v2, v1]} required />);
    expect(html).toContain('required=""');
    expect(html).toContain('<option value="" selected="">');
    expect(html).toContain('SD-01 · 标准 v1');
    expect(html).toContain('SD-01 · 标准 v2');
  });
  it('keeps an older pinned reference visible when options contain a correction', () => {
    const html = renderToStaticMarkup(<ReviewStandardSelect value={v1.id} onChange={vi.fn()} options={[v2]} locked />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('<option value="version-v1" selected="">');
    expect(reviewStandardLabel(v1)).toBe('SD-01 · 标准 v1');
    expect(reviewStandardLabel(null)).toBe('历史记录未关联标准版本');
  });
});
