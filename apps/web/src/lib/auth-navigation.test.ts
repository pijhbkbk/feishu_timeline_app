import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from './auth-client';
import { defaultHome, loginHref, resolveLoginDestination } from './auth-navigation';
const origin = 'https://app.example';
const admin: SessionUser = { id: 'owner', username: '001234', name: '合成用户', email: null, departmentId: null, departmentName: null, authSource: 'local', isSystemAdmin: true, roleCodes: ['admin'], onboardingCompleted: false, requestedJob: 'process_engineer' };
const pending: SessionUser = { ...admin, isSystemAdmin: false, roleCodes: [] };
const member: SessionUser = { ...pending, teamAccessApproved: true, roleCodes: ['process_engineer'], permissionCodes: ['project.read'] };
const query = (value: string) => `?returnTo=${encodeURIComponent(value)}`;
describe('native login destinations from authenticated permissions', () => {
  it('prioritizes real grants over stale job onboarding; never defaults to account security', () => {
    expect(defaultHome(admin)).toBe('/dashboard');
    expect(defaultHome(member)).toBe('/dashboard');
    expect(defaultHome(pending)).toBe('/pending-access');
    expect(defaultHome({ ...pending, roleCodes: ['admin'] })).toBe('/pending-access');
    expect(defaultHome({ ...admin, roleCodes: [] })).toBe('/dashboard');
    expect(loginHref('/dashboard')).toBe('/login');
    expect(loginHref('/projects/project-a', '?taskId=task-a')).toBe('/login?returnTo=%2Fprojects%2Fproject-a%3FtaskId%3Dtask-a');
  });
  it.each(['https://evil.example/dashboard', '//evil.example/dashboard', '/\\evil.example/dashboard', 'javascript:alert(1)', '/%2f%2fevil.example', '/%255cevil.example', '/login', '/login/callback', '/not-a-product-route', '/dashboard\n'])('rejects unsafe or looping target %s', async target => {
    expect(await resolveLoginDestination(admin, query(target), origin, vi.fn())).toBe('/dashboard');
  });
  it('rejects ambiguous return parameters and ignores old implicit next/account values', async () => {
    expect(await resolveLoginDestination(admin, '?returnTo=/account&returnTo=/projects', origin, vi.fn())).toBe('/dashboard');
    expect(await resolveLoginDestination(admin, '?next=/account&passwordChanged=1', origin, vi.fn())).toBe('/dashboard');
  });
  it('preserves explicitly chosen same-origin profile/security navigation', async () => {
    expect(await resolveLoginDestination(admin, query(origin + '/account/security'), origin, vi.fn())).toBe('/account/security');
    expect(await resolveLoginDestination(pending, query('/account'), origin, vi.fn())).toBe('/account');
  });
  it('does not grant management navigation from requested jobs or unprivileged deep links', async () => {
    for (const actor of [pending, member]) {
      expect(await resolveLoginDestination(actor, query('/admin/organization'), origin, vi.fn())).toBe(defaultHome(actor));
      expect(await resolveLoginDestination(actor, query('/admin/accounts'), origin, vi.fn())).toBe(defaultHome(actor));
    }
    expect(await resolveLoginDestination(admin, query('/admin/organization'), origin, vi.fn())).toBe('/admin/organization');
  });
  it('allows approved department members to create without claiming an old role', async () => {
    const approved: SessionUser = { ...member, roleCodes: [], permissionCodes: ['project.write'] };
    expect(await resolveLoginDestination(approved, query('/projects/new'), origin, vi.fn())).toBe('/projects/new');
    expect(await resolveLoginDestination({ ...member, teamAccessApproved: false, roleCodes: ['project_manager'], permissionCodes: ['project.write'] }, query('/projects/new'), origin, vi.fn())).toBe('/pending-access');
    expect(await resolveLoginDestination({ ...pending, requestedJob: 'admin' }, query('/projects/new'), origin, vi.fn())).toBe('/pending-access');
    expect(await resolveLoginDestination(admin, query('/projects/new'), origin, vi.fn())).toBe('/projects/new');
  });
  it('returns approved staff to shared business sheets while protecting account permissions', async () => {
    for (const path of ['/admin/people', '/admin/color-database', '/inspections', '/production']) {
      expect(await resolveLoginDestination(member, query(path), origin, vi.fn())).toBe(path);
      expect(await resolveLoginDestination(pending, query(path), origin, vi.fn())).toBe('/pending-access');
    }
    expect(await resolveLoginDestination(member, query('/admin/people/permissions'), origin, vi.fn())).toBe('/dashboard');
  });
  it('preserves a project deep link only after server read permission succeeds', async () => {
    const allowed = vi.fn(async () => true);
    expect(await resolveLoginDestination(member, query('/projects/project-a?taskId=task-a'), origin, allowed)).toBe('/projects/project-a?taskId=task-a');
    expect(allowed).toHaveBeenCalledWith('project-a');
    expect(await resolveLoginDestination(member, query('/projects/private-a'), origin, async () => false)).toBe('/dashboard');
    expect(await resolveLoginDestination(member, query('/projects/private-a'), origin, async () => { throw new Error('403'); })).toBe('/dashboard');
    expect(await resolveLoginDestination(pending, query('/projects/project-a'), origin, allowed)).toBe('/pending-access');
  });
});
