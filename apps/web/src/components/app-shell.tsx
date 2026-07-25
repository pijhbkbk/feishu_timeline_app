'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent, PropsWithChildren } from 'react';

import { FRONTEND_ROLE_OPTIONS } from '../lib/auth-client';
import {
  filterNavItems,
  getAdminSectionItems,
  getProjectSectionItems,
  isTopNavigationItemActive,
  topNavigationItems,
} from '../lib/navigation';
import { useAuth } from './auth-provider';
import { NotificationBell } from './notification-bell';
import { StatePanel } from './state-panel';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, feishuEnabled, startFeishuLogin, logout } = useAuth();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? '轻卡新颜色开发项目管理系统';
  const isAuthRoute = pathname.startsWith('/login');
  const isPublicRoute = isAuthRoute || pathname === '/guide';
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const hasAdminAccess = Boolean(user && (user.isSystemAdmin || user.roleCodes.includes('admin')));
  const topNav = filterNavItems(topNavigationItems, user);
  const projectSegments = pathname.split('/').filter(Boolean);
  const projectId =
    projectSegments[0] === 'projects' &&
    projectSegments[1] &&
    projectSegments[1] !== 'new' &&
    projectSegments[1] !== 'flow-map' &&
    projectSegments[1] !== 'timeline' &&
    projectSegments[1] !== 'timeline-board'
      ? projectSegments[1]
      : null;
  const contextNav = projectId
    ? filterNavItems(getProjectSectionItems(projectId), user)
    : pathname === '/admin' || pathname.startsWith('/admin/')
      ? filterNavItems(getAdminSectionItems(), user)
      : [];

  function handleLoginClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!feishuEnabled) {
      return;
    }

    event.preventDefault();
    void startFeishuLogin().catch(() => {
      window.location.href = '/login';
    });
  }

  const guardedContent =
    !isLoading && isAuthenticated && isAdminRoute && !hasAdminAccess ? (
      <section className="r22-card r22-state-card">
        <StatePanel
          variant="permission"
          title="仅管理员可访问"
          description="后台管理不会出现在普通用户导航中，服务端接口也会再次校验管理员角色和 system.manage 权限。"
          actions={<Link href="/dashboard" className="r22-button r22-button-primary">返回工作台</Link>}
        />
      </section>
    ) : !isLoading && !isAuthenticated && !isPublicRoute ? (
      <section className="page-card">
        <p className="eyebrow">身份认证</p>
        <StatePanel
          variant="permission"
          title="请先登录"
          description="前端仅做登录态提示，真正的权限校验仍由后端接口完成。"
          actions={
            <Link href="/login" className="button button-primary" onClick={handleLoginClick}>
              前往登录
            </Link>
          }
        />
      </section>
    ) : (
      children
    );

  return (
    <div className="shell r22-shell">
      <header className="r22-app-header">
        <div className="r22-app-header-inner">
          <Link href="/dashboard" className="r22-brand" aria-label={`${appName}首页`}>
            <span className="r22-brand-mark" aria-hidden="true">色</span>
            <span>
              <strong>轻卡定制色</strong>
              <small>开发管理系统</small>
            </span>
          </Link>

          {!isAuthRoute ? (
            <nav className="r22-primary-nav" aria-label="主导航">
              {topNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isTopNavigationItemActive(pathname, item.href) ? 'is-active' : undefined}
                  aria-current={isTopNavigationItemActive(pathname, item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="r22-header-tools">
            {!isAuthRoute ? (
              <>
                <Link href="/projects?focus=search" className="r22-icon-button" aria-label="搜索项目">
                  <span aria-hidden="true">⌕</span>
                </Link>
                <NotificationBell />
                <Link href="/guide" className="r22-icon-button" aria-label="打开帮助">
                  <span aria-hidden="true">?</span>
                </Link>
              </>
            ) : null}
            {isLoading ? (
              <span className="r22-avatar r22-avatar-loading" aria-label="正在加载登录态" />
            ) : user ? (
              <details className="r22-profile-menu">
                <summary aria-label="打开个人菜单">
                  <span className="r22-avatar">{user.name.slice(0, 1)}</span>
                </summary>
                <div className="r22-profile-popover">
                  <strong>{user.name}</strong>
                  <span>{user.departmentName ?? '未分配部门'}</span>
                  <small>{formatRoleCodes(user.roleCodes)}</small>
                  {user.isSystemAdmin || user.roleCodes.includes('admin') ? (
                    <Link href="/admin">后台管理</Link>
                  ) : null}
                  <button type="button" onClick={() => void logout()}>退出登录</button>
                </div>
              </details>
            ) : (
              <Link
                href="/login"
                className="r22-login-link"
                onClick={handleLoginClick}
                data-testid="header-feishu-login"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="content r22-content">
        {contextNav.length > 0 ? (
          <nav className="context-nav r22-context-nav" aria-label="当前工作区导航">
            {contextNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                {...(item.href === '/admin/audit-logs'
                  ? {
                      'data-testid': 'admin-audit-nav-link',
                      'aria-label': '进入审计与异常',
                    }
                  : {})}
                className={`context-nav-link ${
                  isContextNavActive(pathname, item.href) ? 'context-nav-link-active' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {guardedContent}
      </main>

      {!isAuthRoute ? (
        <nav className="r22-mobile-nav" aria-label="移动端主导航">
          {topNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isTopNavigationItemActive(pathname, item.href) ? 'is-active' : undefined}
              aria-current={isTopNavigationItemActive(pathname, item.href) ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.label}</small>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function isContextNavActive(pathname: string, href: string) {
  const pathnameSegments = pathname.split('/').filter(Boolean);
  const hrefSegments = href.split('/').filter(Boolean);

  if (hrefSegments.length === 2) {
    return pathnameSegments.length === 2 && pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatRoleCodes(roleCodes: Array<(typeof FRONTEND_ROLE_OPTIONS)[number]['code']>) {
  const labelMap = new Map(FRONTEND_ROLE_OPTIONS.map((item) => [item.code, item.label]));
  return roleCodes.map((roleCode) => labelMap.get(roleCode) ?? roleCode).join('、');
}
