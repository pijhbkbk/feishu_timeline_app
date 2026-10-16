'use client';

import Link from 'next/link';
import { NotificationLink } from '../features/team-work/notifications';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, type PropsWithChildren } from 'react';
import { confirmM1Navigation, useM1NavigationGuard } from '../features/m1/use-unsaved';

import { M1Icon } from '../features/m1/icon';
import { FRONTEND_ROLE_OPTIONS } from '../lib/auth-client';
import { loginHref } from '../lib/auth-navigation';
import {
  filterNavItems,
  getAdminSectionItems,
  getProjectSectionItems,
  isTopNavigationItemActive,
  topNavigationItems,
} from '../lib/navigation';
import { useAuth } from './auth-provider';
import { StatePanel } from './state-panel';

export function AppShell({ children }: PropsWithChildren) {
  useM1NavigationGuard();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  async function handleLogout() {
    if (!confirmM1Navigation()) return;
    setLoggingOut(true); setLogoutError('');
    try { await logout(); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : '退出失败，请重试。'); }
    finally { setLoggingOut(false); }
  }
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? '轻卡新颜色开发项目管理系统';
  const isAuthRoute = pathname.startsWith('/login');
  const isPublicRoute = isAuthRoute || pathname === '/guide';
  const isColorDatabaseRoute =
    pathname === '/admin/color-database' || pathname.startsWith('/admin/color-database/');
  const isAdminRoute =
    (pathname === '/admin' || pathname.startsWith('/admin/')) && !isColorDatabaseRoute;
  const hasAdminAccess = Boolean(user && (user.isSystemAdmin || user.teamAccessApproved || user.roleCodes.includes('admin')));
  const pendingAuthorization = user?.authSource === 'local' && !user.isSystemAdmin && !user.teamAccessApproved;
  const topNav = pendingAuthorization ? [] : filterNavItems(topNavigationItems, user);
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
  const contextNav = projectId && pathname !== `/projects/${projectId}` && !pathname.startsWith(`/projects/${projectId}/tasks/`)
    ? filterNavItems(getProjectSectionItems(projectId), user)
    : /^\/admin\/(projects|tasks|organization|assignments|permissions|audit-logs)$/.test(pathname)
      ? filterNavItems(getAdminSectionItems(), user)
      : [];

  const guardedContent =
    !isLoading && isAuthenticated && isAdminRoute && !hasAdminAccess ? (
      <section className="r22-card r22-state-card">
        <StatePanel
          variant="permission"
          title="仅管理员可访问"
          description="该账号没有管理权限。"
          actions={<Link href="/dashboard" className="r22-button r22-button-primary">返回工作台</Link>}
        />
      </section>
    ) : !isLoading && !isAuthenticated && !isPublicRoute ? (
      <section className="page-card">
        <p className="eyebrow">身份认证</p>
        <StatePanel
          variant="permission"
          title="请先登录"
          description="登录后继续。"
          actions={
            <Suspense fallback={<Link href={loginHref(pathname)} className="button button-primary">前往登录</Link>}><ContextLoginLink pathname={pathname}/></Suspense>
          }
        />
      </section>
    ) : (
      children
    );

  return (
    <div className="shell r22-shell m1-shell">
      <header className={`r22-app-header${isAuthRoute ? ' m1-auth-header' : ''}`}>
        <div className="r22-app-header-inner">
          <Link href="/dashboard" className="r22-brand" aria-label={`${appName}首页`}>
            <span className="r22-brand-mark" aria-hidden="true"><M1Icon name="project" size={24}/></span>
            <span>
              <strong>轻卡定制色</strong>

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
            {!isAuthRoute ? <NotificationLink /> : null}
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
                  <Link href="/account">我的账号</Link>
                  <Link href="/account/security">账号安全</Link>
                  {user.isSystemAdmin ? <Link href="/admin/people">人员</Link> : null}
                  {user.isSystemAdmin ? (
                    <Link href="/admin">管理设置</Link>
                  ) : null}
                  <button type="button" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? '正在退出…' : '退出登录'}</button>
                  {logoutError ? <p role="alert">{logoutError}</p> : null}
                </div>
              </details>
            ) : !isAuthRoute ? (
              <Link
                href="/login"
                className="r22-login-link"
                data-testid="header-native-login"
              >
                登录
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className={`content r22-content${isAuthRoute ? ' native-auth-content' : pathname === '/account' || pathname.startsWith('/account/') || pathname === '/pending-access' ? ' native-account-content' : ''}`}>
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
    </div>
  );
}

function ContextLoginLink({pathname}:{pathname:string}) {
  const search = useSearchParams();
  return <Link href={loginHref(pathname, search.size ? `?${search}` : '')} className="button button-primary">前往登录</Link>;
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
