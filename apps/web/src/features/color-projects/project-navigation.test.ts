import { describe, expect, it } from 'vitest';
import { projectListContext, projectListHref } from './color-projects';

describe('M1 project list navigation context', () => {
  it('round trips search, selected stage and pagination through a project', () => {
    const query = new URLSearchParams('keyword=合成蓝&stage=SAMPLE_COLOR_CONFIRMATION&page=3');
    const context = projectListContext(query);
    expect(context.get('from')).toBe('list');
    const href = projectListHref(context);
    const restored = new URL(href, 'https://timeline.test').searchParams;
    expect(restored.get('keyword')).toBe('合成蓝');
    expect(restored.get('stage')).toBe('SAMPLE_COLOR_CONFIRMATION');
    expect(restored.get('page')).toBe('3');
  });
  it('only builds an internal list route, ignoring supplied return URLs', () => {
    const query = new URLSearchParams('return=https://attacker.test&from=https://attacker.test&listStage=//attacker.test&listPage=-9');
    expect(projectListHref(query)).toBe('/projects');
  });
  it('bounds search and rejects malformed stage and page values', () => {
    const query = new URLSearchParams({ keyword: '字'.repeat(400), stage: '../tasks', page: 'Infinity' });
    const context = projectListContext(query);
    expect(context.get('listKeyword')).toHaveLength(100);
    expect(context.has('listStage')).toBe(false);
    expect(context.has('listPage')).toBe(false);
    expect(projectListHref(new URLSearchParams('listPage=1.5'))).toBe('/projects');
  });
  it('leaves the default route free of empty filter parameters', () => {
    expect(projectListHref(projectListContext(new URLSearchParams()))).toBe('/projects');
  });
});
