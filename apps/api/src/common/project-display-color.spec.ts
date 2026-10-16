import { describe, expect, it } from 'vitest';
import { assertLinkedProjectColorNameUnchanged, projectColorSearchWhere, resolveProjectDisplayColor } from './project-display-color';

describe('explicit project color identity', () => {
  const legacy = { id: 'origin-color', name: '同名蓝', productionBaseId: 'origin-base' };
  const linked = { id: 'linked-color', name: '同名蓝', productionBaseId: 'linked-base' };

  it('shows the explicitly linked base record even when the origin project has a same-name color', () => {
    expect(resolveProjectDisplayColor({ primaryColorId: linked.id, primaryColor: linked, colors: [legacy] })).toBe(linked);
  });

  it('does not substitute an old identity when an explicit relation is missing or mismatched', () => {
    expect(resolveProjectDisplayColor({ primaryColorId: linked.id, primaryColor: null, colors: [legacy] })).toBeNull();
    expect(resolveProjectDisplayColor({ primaryColorId: linked.id, primaryColor: legacy, colors: [legacy] })).toBeNull();
  });

  it('preserves the origin-project fallback only for projects with no explicit link', () => {
    expect(resolveProjectDisplayColor({ primaryColorId: null, primaryColor: linked, colors: [legacy] })).toBe(legacy);
    expect(resolveProjectDisplayColor({ colors: [] })).toBeNull();
    expect(resolveProjectDisplayColor(undefined)).toBeNull();
  });

  it('restricts legacy color search matches to projects without a primary link', () => {
    const where = projectColorSearchWhere('同名蓝');
    expect(where.OR).toEqual([
      { primaryColor: { is: expect.objectContaining({ OR: expect.any(Array) }) } },
      { primaryColorId: null, colors: { some: expect.objectContaining({ OR: expect.any(Array) }) } },
    ]);
  });

  it('rejects renaming a linked register color through generic project edits', () => {
    const project = { primaryColorId: linked.id, primaryColor: linked, colors: [legacy] };
    expect(() => assertLinkedProjectColorNameUnchanged(project, '改名')).toThrow('项目已关联颜色清单');
    expect(() => assertLinkedProjectColorNameUnchanged(project, null)).toThrow('项目已关联颜色清单');
    expect(() => assertLinkedProjectColorNameUnchanged(project, linked.name)).not.toThrow();
    expect(() => assertLinkedProjectColorNameUnchanged(project, undefined)).not.toThrow();
    expect(() => assertLinkedProjectColorNameUnchanged({ colors: [legacy] }, '改名')).not.toThrow();
  });
});
