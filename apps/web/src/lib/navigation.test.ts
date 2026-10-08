import { describe, expect, it } from 'vitest';

import {
  isTopNavigationItemActive,
  topNavigationItems,
} from './navigation';

const routeMatrix = [
  ['/dashboard', '工作台'],
  ['/v2/dashboard', '工作台'],
  ['/projects', '颜色项目'],
  ['/projects/project-1', '颜色项目'],
  ['/projects/project-1/pilot-production', '颜色项目'],
  ['/v2/projects/project-1', '颜色项目'],
  ['/tasks', '工作台'],
  ['/tasks/pending', '工作台'],
  ['/v2/tasks', '工作台'],
  ['/progress?projectId=project-1&taskId=task-1', '工作台'],
  ['/v2/progress?projectId=project-1&taskId=task-1', '工作台'],
  ['/materials/upload?taskId=task-1', '工作台'],
  ['/admin/color-database', '颜色清单'],
  ['/admin/color-database/color-1', '颜色清单'],
  ['/monthly-reviews', '周评'],
  ['/analytics', '产量统计'],
  ['/admin', null],
  ['/admin/users', '人员库'],
  ['/admin/people', '人员库'],
  ['/admin/organization', '人员库'],
  ['/v2/admin/people', '人员库'],
  ['/admin/roles', null],
  ['/admin/audit-logs', null],
  ['/v2/admin', null],
  ['/v2/admin/audit-logs', null],
] as const;

describe('top navigation route matrix', () => {
  it('uses the approved product names', () => {
    expect(topNavigationItems.map((item) => item.label)).toEqual([
      '工作台',
      '颜色项目',
      '颜色清单',
      '周评',
      '产量统计',
      '人员库',
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
