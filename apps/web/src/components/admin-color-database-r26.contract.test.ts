import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(new URL('./admin-dashboard-r22.tsx', import.meta.url), 'utf8');
const manageSource = readFileSync(new URL('./admin-manage-r26.tsx', import.meta.url), 'utf8');
const databaseSource = readFileSync(new URL('./admin-color-database-r26.tsx', import.meta.url), 'utf8');
const archiveSource = readFileSync(new URL('./admin-color-archive-r26.tsx', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../lib/admin-client.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/r22.css', import.meta.url), 'utf8');

describe('R26 simplified admin and color archive contracts', () => {
  it('keeps the admin first screen to six real metrics and exactly two primary entries', () => {
    for (const label of ['项目总数', '进行中项目', '风险项目', '启用人员', '启用部门', '已归档颜色']) {
      expect(dashboardSource).toContain(label);
    }
    expect(dashboardSource).toContain('href="/admin/manage"');
    expect(dashboardSource).toContain('href="/admin/color-database"');
    expect(dashboardSource).not.toContain('启用角色');
    expect(dashboardSource).not.toContain('异常动作');
    expect(dashboardSource).not.toContain('r22-admin-module-card');
  });

  it('preserves existing management capabilities behind the management entry', () => {
    for (const label of ['项目与工序', '组织与成员', '分工与权限', '流程与参数', '审计与异常']) {
      expect(manageSource).toContain(label);
    }
    for (const route of ['/admin/projects', '/admin/tasks', '/admin/organization', '/admin/assignments', '/admin/permissions', '/admin/audit-logs']) {
      expect(manageSource).toContain(route);
    }
  });

  it('uses existing attachment reads without exposing a second upload entry', () => {
    expect(databaseSource).toContain('搜索颜色名称、颜色编号、车型或项目编号');
    expect(databaseSource).toContain('材料直接引用现有附件记录，未复制文件');
    expect(archiveSource).toContain('文件仍存放于原附件系统');
    expect(archiveSource).toContain('历史版本');
    expect(databaseSource).not.toContain('上传材料');
    expect(clientSource).toContain('/admin/color-database');
  });

  it('defines required desktop, tablet and mobile layouts', () => {
    expect(cssSource).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
    expect(cssSource).toContain('@media (max-width: 1100px)');
    expect(cssSource).toContain('.r26-admin-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
    expect(cssSource).toContain('.r26-admin-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }');
  });
});
