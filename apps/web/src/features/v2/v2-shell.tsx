'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type MouseEvent, type SVGProps } from 'react';

import {
  BellIcon,
  HelpIcon,
  HomeIcon,
  ProgressIcon,
  ProjectIcon,
  RetrospectiveIcon,
  SearchIcon,
  TaskIcon,
} from './icons';

type NavItem = {
  label: string;
  href: string;
  enabled: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const navItems: NavItem[] = [
  { label: '工作台', href: '/v2/dashboard', enabled: true, icon: HomeIcon },
  { label: '项目列表', href: '/v2/projects', enabled: true, icon: ProjectIcon },
  { label: '我的任务', href: '/v2/tasks', enabled: false, icon: TaskIcon },
  { label: '进展提交', href: '/v2/progress?projectId=demo-r26&taskId=t006', enabled: true, icon: ProgressIcon },
  { label: '系统管理', href: '/v2/admin', enabled: false, icon: RetrospectiveIcon },
];

export function V2Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [toast, setToast] = useState<string | null>(null);

  function showStaticMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function handleDisabled(event: MouseEvent<HTMLAnchorElement>, label: string) {
    event.preventDefault();
    showStaticMessage(`${label}将在后续轮次开放，本轮仅验证四个核心页面。`);
  }

  return (
    <div className="r26-app">
      <header className="r26-app-header">
        <div className="r26-app-header__inner">
          <Link href="/v2/dashboard" className="r26-brand" aria-label="轻卡定制色开发管理系统工作台">
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
              const isActive = isNavActive(pathname, item.href);
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
            <span className="r26-prototype-badge">V2 产品预览</span>
            <button type="button" className="r26-icon-button" aria-label="搜索" onClick={() => showStaticMessage('搜索功能将在数据联调轮次开放。')}>
              <SearchIcon />
            </button>
            <button type="button" className="r26-icon-button" aria-label="通知" onClick={() => showStaticMessage('当前没有新的原型通知。')}>
              <BellIcon />
            </button>
            <button type="button" className="r26-icon-button" aria-label="帮助" onClick={() => showStaticMessage('系统导览不在本轮实现范围内。')}>
              <HelpIcon />
            </button>
            <button type="button" className="r26-avatar" aria-label="张七巧的账号菜单" onClick={() => showStaticMessage('当前身份：张七巧 · 采购部')}>
              张
            </button>
          </div>
        </div>
      </header>

      <main className="r26-main">{children}</main>

      <nav className="r26-mobile-nav" aria-label="V2 移动端主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(pathname, item.href);
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

function isNavActive(pathname: string, href: string) {
  const path = href.split('?')[0];
  if (path === '/v2/projects') {
    return pathname === path || pathname.startsWith('/v2/projects/');
  }

  return pathname === path;
}
