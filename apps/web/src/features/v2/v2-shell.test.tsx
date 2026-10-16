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
      authSource?: string;
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

  it('does not render global search, notification, or help controls', () => {
    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );

    expect(html).not.toContain('搜索项目');
    expect(html).not.toContain('通知中心');
    expect(html).not.toContain('打开帮助');
    expect(html).not.toContain('href="/guide"');
    expect(html).toContain('李晓晨的账号信息');
  });

  it('renders only the three product destinations', () => {
    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );
    const primaryNavHtml = html.match(
      /<nav class="r26-primary-nav" aria-label="V2 主导航">([\s\S]*?)<\/nav>/,
    )?.[1];

    expect(primaryNavHtml).toBeDefined();
    expect(primaryNavHtml?.match(/href="\/v2\/(?:dashboard|projects|admin\/people)"/g)).toHaveLength(3);
    expect(primaryNavHtml?.match(/aria-current="page"/g)).toHaveLength(1);
    expect(primaryNavHtml).not.toContain('aria-disabled="true"');
    expect(primaryNavHtml).not.toContain('进展提交');
  });

  it('maps the progress workflow to the my-work destination', () => {
    pathnameState.value = '/v2/progress';

    const html = renderToStaticMarkup(
      <V2Shell>
        <p>页面内容</p>
      </V2Shell>,
    );

    expect(html).toContain(
      'class="is-active" aria-current="page" aria-disabled="false" href="/v2/dashboard"',
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('进展提交');
  });

  it('does not render protected navigation or business data before native login', () => {
    authState.user = null;
    authState.isAuthenticated = false;

    const html = renderToStaticMarkup(
      <V2Shell>
        <p>受保护的业务页面</p>
      </V2Shell>,
    );

    expect(html).toContain('data-testid="r26-auth-redirect"');
    expect(html).toContain('正在打开账号登录');
    expect(html).not.toContain('V2 主导航');
    expect(html).not.toContain('受保护的业务页面');
    expect(html).not.toContain('真实数据暂时不可用');
  });

  it('keeps a native account without granted roles in the account approval flow', () => {
    authState.user = { id: 'new-user', name: '待授权', departmentName: null, roleCodes: [], isSystemAdmin: false, authSource: 'local' };
    const html = renderToStaticMarkup(<V2Shell><p>受保护的业务页面</p></V2Shell>);
    expect(html).toContain('账号尚未分配正式角色');
    expect(html).not.toContain('V2 主导航');
    expect(html).not.toContain('受保护的业务页面');
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
