'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import {
  useEffect,
  useState,
  type ComponentType,
  type MouseEvent,
  type SVGProps,
} from 'react';

import { useAuth } from '../../components/auth-provider';
import { isTopNavigationItemActive } from '../../lib/navigation';
import {
  BellIcon,
  HelpIcon,
  HomeIcon,
  ProjectIcon,
  RetrospectiveIcon,
  SearchIcon,
  TaskIcon,
} from './icons';
import { isProductionV2Ui, toProductHref } from './production-ui';
import { useR26RealData } from './r26-real-data-context';

type NavItem = {
  label: string;
  href: string;
  activeHref?: string;
  enabled: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const baseNavItems: NavItem[] = [
  { label: '工作台', href: toProductHref('/v2/dashboard'), enabled: true, icon: HomeIcon },
  { label: '项目列表', href: toProductHref('/v2/projects'), enabled: true, icon: ProjectIcon },
  { label: '我的任务', href: toProductHref('/v2/tasks'), enabled: true, icon: TaskIcon },
  { label: '系统管理', href: toProductHref('/v2/admin'), enabled: true, icon: RetrospectiveIcon },
];

export function V2Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    refreshSession,
    logout,
  } = useAuth();
  const { enabled: realDataEnabled, viewer } = useR26RealData();
  const navItems = baseNavItems;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && !authError) {
      window.location.replace('/login');
    }
  }, [authError, isAuthenticated, isAuthLoading]);

  function showStaticMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function handleDisabled(event: MouseEvent<HTMLAnchorElement>, label: string) {
    event.preventDefault();
    showStaticMessage(`${label}将在后续轮次开放，本轮仅验证四个核心页面。`);
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logout();
      window.location.assign('/login?loggedOut=1');
    } catch {
      setIsLoggingOut(false);
      showStaticMessage('退出登录失败，请检查网络后重试。');
    }
  }

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="r26-app">
        <main className="r26-main">
          <div
            className="r26-page"
            data-testid={authError ? 'r26-auth-error' : 'r26-auth-redirect'}
          >
            <section className="r26-real-state" role={authError ? 'alert' : 'status'}>
              <span
                className={
                  authError
                    ? 'r26-real-state__error'
                    : 'r26-real-state__spinner'
                }
                aria-hidden="true"
              />
              <strong>
                {authError
                  ? '登录服务暂时不可用'
                  : isAuthLoading
                    ? '正在验证登录状态…'
                    : '正在打开飞书登录…'}
              </strong>
              <p>{authError ?? '未检测到有效会话，即将进入飞书安全登录。'}</p>
              {authError ? (
                <button
                  type="button"
                  className="r26-button r26-button--primary"
                  onClick={() => void refreshSession()}
                >
                  重新检查登录状态
                </button>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="r26-app">
      <header className="r26-app-header">
        <div className="r26-app-header__inner">
          <Link href={toProductHref('/v2/dashboard')} className="r26-brand" aria-label="轻卡定制色开发管理系统工作台">
            <span className="r26-brand__mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="r26-brand__copy">
              <strong>轻卡定制色</strong>
              <small>开发管理系统</small>
            </span>
          </Link>

          <nav className="r26-primary-nav" aria-label="V2 主导航">
            {navItems.map((item) => {
              const isActive = isTopNavigationItemActive(
                pathname,
                item.activeHref ?? item.href,
              );
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={isActive ? 'is-active' : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={!item.enabled}
                  {...(!item.enabled
                    ? {
                        prefetch: false,
                        onClick: (event: MouseEvent<HTMLAnchorElement>) => handleDisabled(event, item.label),
                      }
                    : {})}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="r26-header-tools">
            <span className="r26-prototype-badge">
              {isProductionV2Ui()
                ? '正式系统'
                : realDataEnabled
                  ? 'V2 真实数据'
                  : 'V2 产品预览'}
            </span>
            <button type="button" className="r26-icon-button" aria-label="搜索" onClick={() => showStaticMessage('搜索功能将在数据联调轮次开放。')}>
              <SearchIcon />
            </button>
            <button type="button" className="r26-icon-button" aria-label="通知" onClick={() => showStaticMessage('当前没有新的通知。')}>
              <BellIcon />
            </button>
            <button type="button" className="r26-icon-button" aria-label="帮助" onClick={() => showStaticMessage('系统导览不在本轮实现范围内。')}>
              <HelpIcon />
            </button>
            <details className="r26-account-menu">
              <summary aria-label={`${viewer?.name ?? user?.name ?? '当前用户'}的账号信息`}>
                <span className="r26-avatar" aria-hidden="true">
                  {(viewer?.name ?? user?.name ?? '张').slice(0, 1)}
                </span>
              </summary>
              <div className="r26-account-popover" role="menu" aria-label="账号菜单">
                <div className="r26-account-popover__identity">
                  <strong>{viewer?.name ?? user?.name ?? '当前用户'}</strong>
                  <span>
                    {viewer?.departmentName ??
                      user?.departmentName ??
                      (realDataEnabled ? '组织部门待同步' : '采购部')}
                  </span>
                  <small>
                    {viewer?.roleLabel ??
                      viewer?.roleCodes.join('、') ??
                      user?.roleCodes.join('、') ??
                      '当前账号'}
                  </small>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                  disabled={isLoggingOut}
                  data-testid="v2-logout-button"
                >
                  {isLoggingOut ? '正在退出…' : '退出登录'}
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="r26-main">{children}</main>

      <nav className="r26-mobile-nav" aria-label="V2 移动端主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isTopNavigationItemActive(
            pathname,
            item.activeHref ?? item.href,
          );
          return (
            <Link
              key={item.label}
              href={item.href}
              className={isActive ? 'is-active' : undefined}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={!item.enabled}
              {...(!item.enabled
                ? {
                    prefetch: false,
                    onClick: (event: MouseEvent<HTMLAnchorElement>) => handleDisabled(event, item.label),
                  }
                : {})}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {toast ? (
        <div className="r26-toast" role="status" data-testid="r26-toast">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
