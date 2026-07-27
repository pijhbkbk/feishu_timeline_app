import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pathnameState } = vi.hoisted(() => ({
  pathnameState: { value: '/v2/dashboard' },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock('../../components/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      name: '李晓晨',
      departmentName: null,
      roleCodes: ['admin'],
      isSystemAdmin: true,
    },
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
});
