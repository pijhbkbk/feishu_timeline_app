import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../components/auth-provider', () => ({ useAuth: () => ({ user: { id: 'actor', isSystemAdmin: false } }) }));
vi.mock('../m1/use-unsaved', () => ({ useProjectUnsavedChanges: vi.fn() }));
import { PeopleDirectory, canChangePersonAccount, directoryQuery } from './people-directory';
import type { PersonRecord } from '../person-sheet/person-adapter';
const person = { id: 'person-a', isActive: true, archivedAt: null, account: null } as PersonRecord;
describe('person directory user contract', () => {
  it('uses bounded server search and separates archived people from the default list', () => {
    const current = new URL(directoryQuery('同名 / 中文', 'current', ''), 'https://unit.invalid');
    expect(current.searchParams.get('archived')).toBe('false');
    expect(current.searchParams.get('take')).toBe('30');
    expect(current.searchParams.get('q')).toBe('同名 / 中文');
    expect(new URL(directoryQuery('', 'active', ''), 'https://unit.invalid').searchParams.get('active')).toBe('true');
    expect(new URL(directoryQuery('', 'archived', 'next-id'), 'https://unit.invalid').searchParams.get('archived')).toBe('true');
  });
  it('never exposes account status bypass to a member, an archived record or the logged-in administrator', () => {
    expect(canChangePersonAccount(person, false, 'actor')).toBe(true);
    const linked = { ...person, account: { id: 'other', isSystemAdmin: false } } as PersonRecord;
    expect(canChangePersonAccount(linked, false, 'actor')).toBe(false);
    expect(canChangePersonAccount(linked, true, 'actor')).toBe(true);
    expect(canChangePersonAccount({ ...linked, archivedAt: '2026-10-19' }, true, 'actor')).toBe(false);
    expect(canChangePersonAccount({ ...linked, account: { ...linked.account!, id: 'actor', isSystemAdmin: true } }, true, 'actor')).toBe(false);
  });
  it('starts with the compact directory and an explicit retained sheet entry, without role assignment', () => {
    const html = renderToStaticMarkup(<PeopleDirectory onSheet={() => undefined} />);
    expect(html).toContain('工艺部人员'); expect(html).toContain('表格编辑'); expect(html).toContain('已归档');
    expect(html).not.toContain('分配角色'); expect(html).not.toContain('领取任务');
  });
});
