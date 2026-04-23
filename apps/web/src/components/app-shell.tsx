'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import {
  filterNavItems,
  getAdminSectionItems,
  getProjectSectionItems,
  getRouteContext,
  isNavItemActive,
  sidebarSections,
  topNavigationItems,
} from '../lib/navigation';
import { useAuth } from './auth-provider';
import { NotificationBell } from './notification-bell';
import { StatePanel } from './state-panel';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? '轻卡新颜色开发项目管理系统';
  const isAuthRoute = pathname.startsWith('/login');
  const routeContext = getRouteContext(pathname);
  const topNav = filterNavItems(topNavigationItems, user);
  const visibleSidebarSections = sidebarSections
    .map((section) => ({
      ...section,
      items: filterNavItems(section.items, user),
    }))
    .filter((section) => section.items.length > 0);
  const projectSegments = pathname.split('/').filter(Boolean);
  const projectId =
    projectSegments[0] === 'projects' && projectSegments[1] && projectSegments[1] !== 'new'
      ? projectSegments[1]
      : null;
  const contextNav = projectId
    ? filterNavItems(getProjectSectionItems(projectId), user)
    : pathname === '/admin' || pathname.startsWith('/admin/')
      ? filterNavItems(getAdminSectionItems(), user)
      : [];

  const guardedContent =
    !isLoading && !isAuthenticated && !isAuthRoute ? (
      <section className="page-card">
        <p className="eyebrow">Authentication Required</p>
        <StatePanel
          variant="permission"
          title="请先登录"
          description="前端仅做登录态提示，真正的权限校验仍由后端接口完成。"
          actions={
            <Link href="/login" className="button button-primary">
              前往登录
            </Link>
          }
        />
      </section>
    ) : (
      children
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-kicker">MVP Skeleton</span>
          <strong>{appName}</strong>
        </div>
        {visibleSidebarSections.map((section) => (
          <section key={section.title} className="nav-section">
            <p className="nav-section-title">{section.title}</p>
            <nav className="nav">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${isNavItemActive(pathname, item) ? 'nav-link-active' : ''}`}
                >
                  <span>{item.label}</span>
                  {item.description ? <small>{item.description}</small> : null}
                </Link>
              ))}
            </nav>
          </section>
        ))}
        <section className="session-panel">
          <p className="eyebrow">Session</p>
          {isLoading ? (
            <p className="session-copy">正在加载登录态…</p>
          ) : user ? (
            <>
              <strong>{user.name}</strong>
              <p className="session-copy">{user.roleCodes.join(', ')}</p>
              <p className="session-copy">
                {user.departmentName ?? '未分配部门'} / {user.authSource}
              </p>
              <button type="button" className="button button-secondary" onClick={() => void logout()}>
                退出登录
              </button>
            </>
          ) : (
            <>
              <p className="session-copy">当前未登录。</p>
              <Link href="/login" className="button button-primary">
                去登录
              </Link>
            </>
          )}
        </section>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">{routeContext.eyebrow}</p>
            <h1 className="topbar-title">{routeContext.title}</h1>
            <p className="topbar-description">{routeContext.description}</p>
          </div>
          <div className="topbar-tools">
            {!isAuthRoute ? <NotificationBell /> : null}
            <nav className="top-nav">
              {topNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`top-nav-link ${isNavItemActive(pathname, item) ? 'top-nav-link-active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {contextNav.length > 0 ? (
          <nav className="context-nav">
            {contextNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`context-nav-link ${
                  isNavItemActive(pathname, item) ? 'context-nav-link-active' : ''
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
