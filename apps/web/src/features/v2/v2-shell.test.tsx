import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pathnameState, authState } = vi.hoisted(() => ({
  pathnameState: { value: '/v2/dashboard' },
  authState: {
    user: {
      id: 'admin-1',
      name: '李晓晨',
      departmentName: null,
      roleCodes: ['admin'],
      isSystemAdmin: true,
    } as {
      id: string;
      name: string;
      departmentName: string | null;
      roleCodes: string[];
      isSystemAdmin: boolean;
    } | null,
    isAuthenticated: true,
    isLoading: false,
    error: null as string | null,
  },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock('../../components/auth-provider', () => ({
  useAuth: () => ({
    ...authState,
    refreshSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('./r26-real-data-context', () => ({
  useR26RealData: () => ({
    enabled: true,
    dashboardResponse: {
      dashboard: {
        currentTask: null,
      },
    },
    viewer: {
      name: '李晓晨',
      departmentName: null,
      roleCodes: ['admin'],
      roleLabel: '系统管理员',
    },
  }),
}));

import { V2Shell } from './v2-shell';

describe('V2 account menu', () => {
  beforeEach(() => {
    pathnameState.value = '/v2/dashboard';
    authState.user = {
      id: 'admin-1',
      name: '李晓晨',
      departmentName: null,
      roleCodes: ['admin'],
      isSystemAdmin: true,
    };
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.error = null;
  });

  it('renders signed-in identity and a real logout action', () => {
    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );

    expect(html).toContain('李晓晨的账号信息');
    expect(html).toContain('系统管理员');
    expect(html).toContain('data-testid="v2-logout-button"');
    expect(html).toContain('退出登录');
  });

  it('renders only the four retained product destinations', () => {
    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );

    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('进展提交');
  });

  it('does not invent an active navigation item for a removed route', () => {
    pathnameState.value = '/v2/progress';

    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );

    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain('进展提交');
  });

  it('does not render protected navigation or business data before Feishu login', () => {
    authState.user = null;
    authState.isAuthenticated = false;

    const html = renderToStaticMarkup(
      <V2Shell>
        <p>受保护的业务页面</p>
      </V2Shell>,
    );

    expect(html).toContain('data-testid="r26-auth-redirect"');
    expect(html).toContain('正在打开飞书登录');
    expect(html).not.toContain('V2 主导航');
    expect(html).not.toContain('受保护的业务页面');
    expect(html).not.toContain('真实数据暂时不可用');
  });

  it('shows an authentication-specific retry when the session service fails', () => {
    authState.user = null;
    authState.isAuthenticated = false;
    authState.error = '网络连接失败，请稍后重试。';

    const html = renderToStaticMarkup(
      <V2Shell>
        <p>受保护的业务页面</p>
      </V2Shell>,
    );

    expect(html).toContain('data-testid="r26-auth-error"');
    expect(html).toContain('登录服务暂时不可用');
    expect(html).toContain('重新检查登录状态');
    expect(html).not.toContain('真实数据暂时不可用');
  });
});
