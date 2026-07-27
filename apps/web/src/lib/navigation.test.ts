import { describe, expect, it } from 'vitest';

import {
  isTopNavigationItemActive,
  topNavigationItems,
} from './navigation';

const routeMatrix = [
  ['/dashboard', '工作台'],
  ['/v2/dashboard', '工作台'],
  ['/projects', '项目列表'],
  ['/projects/project-1', '项目列表'],
  ['/projects/project-1/pilot-production', '项目列表'],
  ['/v2/projects/project-1', '项目列表'],
  ['/tasks', '我的任务'],
  ['/tasks/pending', '我的任务'],
  ['/v2/tasks', '我的任务'],
  ['/admin', '系统管理'],
  ['/admin/users', '系统管理'],
  ['/admin/roles', '系统管理'],
  ['/admin/audit-logs', '系统管理'],
  ['/v2/admin', '系统管理'],
  ['/v2/admin/audit-logs', '系统管理'],
] as const;

describe('top navigation route matrix', () => {
  it('uses the approved product names', () => {
    expect(topNavigationItems.map((item) => item.label)).toEqual([
      '工作台',
      '项目列表',
      '我的任务',
      '系统管理',
    ]);
  });

  it.each(routeMatrix)('maps %s to only %s', (pathname, expectedLabel) => {
    const activeItems = topNavigationItems.filter((item) =>
      isTopNavigationItemActive(pathname, item.href),
    );

    expect(activeItems.map((item) => item.label)).toEqual([expectedLabel]);
  });

  it('does not assign product navigation state to public routes', () => {
    expect(
      topNavigationItems.filter((item) =>
        isTopNavigationItemActive('/login', item.href),
      ),
    ).toEqual([]);
    expect(
      topNavigationItems.filter((item) =>
        isTopNavigationItemActive('/guide', item.href),
      ),
    ).toEqual([]);
    expect(
      topNavigationItems.filter((item) =>
        isTopNavigationItemActive('/progress', item.href),
      ),
    ).toEqual([]);
  });
});
