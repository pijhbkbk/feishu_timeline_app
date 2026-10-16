import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: {
  id: 'synthetic-owner', username: '001234', name: '合成管理员',
  email: null, departmentId: 'department', departmentName: '合成部门',
  isSystemAdmin: true, authSource: 'local', roleCodes: ['admin'],
  requestedJob: 'process_engineer', onboardingCompleted: false,
} }));
vi.mock('../../components/auth-provider', () => ({ useAuth: () => ({
  user: state.user, refreshSession: vi.fn(), logout: vi.fn(),
}) }));
import AccountPage from './page';

describe('account profile is separate from onboarding and password changes', () => {
  beforeEach(() => { state.user.isSystemAdmin = true; state.user.roleCodes = ['admin']; });
  it('shows the real administrator identity despite old incomplete job onboarding', () => {
    const html = renderToStaticMarkup(<AccountPage />);
    expect(html).toContain('我的账号');
    expect(html).toContain('系统管理员');
    expect(html).toContain('合成部门');
    expect(html).not.toContain('选择你的岗位');
    expect(html).not.toContain('请联系管理员确认岗位');
  });
  it('keeps passwords off the profile and provides an explicit security destination', () => {
    const html = renderToStaticMarkup(<AccountPage />);
    expect(html).not.toContain('type="password"');
    expect(html).toContain('href="/account/security"');
    expect(html).toContain('001234');
  });
  it('never presents a requested job as a granted role', () => {
    state.user.isSystemAdmin = false; state.user.roleCodes = [];
    const html = renderToStaticMarkup(<AccountPage />);
    expect(html).not.toContain('管理账号');
    expect(html).toContain('尚未分配');
    expect(html).not.toContain('type="password"');
  });
});
