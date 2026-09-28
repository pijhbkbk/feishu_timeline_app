import { describe, expect, it } from 'vitest';

import {
  isTopNavigationItemActive,
  topNavigationItems,
} from './navigation';

const routeMatrix = [
  ['/dashboard', '我的工作'],
  ['/v2/dashboard', '我的工作'],
  ['/projects', '颜色项目'],
  ['/projects/project-1', '颜色项目'],
  ['/projects/project-1/pilot-production', '颜色项目'],
  ['/v2/projects/project-1', '颜色项目'],
  ['/tasks', '我的工作'],
  ['/tasks/pending', '我的工作'],
  ['/v2/tasks', '我的工作'],
  ['/progress?projectId=project-1&taskId=task-1', '我的工作'],
  ['/v2/progress?projectId=project-1&taskId=task-1', '我的工作'],
  ['/materials/upload?taskId=task-1', '我的工作'],
  ['/admin', null],
  ['/admin/users', '人员'],
  ['/admin/people', '人员'],
  ['/admin/organization', '人员'],
  ['/v2/admin/people', '人员'],
  ['/admin/roles', null],
  ['/admin/audit-logs', null],
  ['/v2/admin', null],
  ['/v2/admin/audit-logs', null],
] as const;

describe('top navigation route matrix', () => {
  it('uses the approved product names', () => {
    expect(topNavigationItems.map((item) => item.label)).toEqual([
      '我的工作',
      '颜色项目',
      '人员',
    ]);
  });

  it.each(routeMatrix)('maps %s to only %s', (pathname, expectedLabel) => {
    const activeItems = topNavigationItems.filter((item) =>
      isTopNavigationItemActive(pathname, item.href),
    );

    expect(activeItems.map((item) => item.label)).toEqual(expectedLabel ? [expectedLabel] : []);
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
  });
});
