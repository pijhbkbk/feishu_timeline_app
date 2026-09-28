'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { useEffect, useState, type MouseEvent } from 'react';

import { useAuth } from '../../components/auth-provider';
import { isTopNavigationItemActive } from '../../lib/navigation';
import { loginHref, needsAssignment } from '../../lib/auth-navigation';
import { isProductionV2Ui, toProductHref } from './production-ui';
import { useR26RealData } from './r26-real-data-context';

type NavItem = {
  label: string;
  href: string;
  activeHref?: string;
  enabled: boolean;
};

const baseNavItems: NavItem[] = [
  { label: '我的工作', href: toProductHref('/v2/dashboard'), enabled: true },
  { label: '颜色项目', href: toProductHref('/v2/projects'), enabled: true },
  { label: '人员', href: toProductHref('/v2/admin/people'), enabled: true },
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
  const pendingAuthorization = Boolean(user && needsAssignment(user));
  const navItems = baseNavItems.filter(item => item.label !== '人员' || user?.isSystemAdmin || user?.roleCodes.includes('admin'));

  useEffect(() => {
    if (!isAuthLoading && pendingAuthorization) { window.location.replace('/pending-access'); return; }
    if (!isAuthLoading && !isAuthenticated && !authError) {
      window.location.replace(loginHref(pathname, window.location.search));
    }
  }, [authError, isAuthenticated, isAuthLoading, pendingAuthorization, pathname]);

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

  if (isAuthLoading || !isAuthenticated || pendingAuthorization) {
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
                    : pendingAuthorization ? '正在打开账号授权状态…' : '正在打开账号登录…'}
              </strong>
              <p>{authError ?? (pendingAuthorization ? '账号尚未分配正式角色，请联系管理员确认。' : '未检测到有效会话，即将进入系统账号登录。')}</p>
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
                      (realDataEnabled ? '尚未分配部门' : '采购部')}
                  </span>
                  <small>
                    {viewer?.roleLabel ??
                      viewer?.roleCodes.join('、') ??
                      user?.roleCodes.join('、') ??
                      '当前账号'}
                  </small>
                </div>
                <Link href="/account" role="menuitem">我的资料</Link>
                <Link href="/account/security" role="menuitem">账号安全</Link>
                {user?.isSystemAdmin ? <Link href="/admin" role="menuitem">管理设置</Link> : null}
                {user?.isSystemAdmin ? <Link href="/admin/people" role="menuitem">人员</Link> : null}
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

      {toast ? (
        <div className="r26-toast" role="status" data-testid="r26-toast">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
