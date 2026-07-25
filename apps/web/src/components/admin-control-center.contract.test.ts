import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./admin-control-center.tsx', import.meta.url),
  'utf8',
);
const clientSource = readFileSync(
  new URL('../lib/admin-client.ts', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../app/r22.css', import.meta.url),
  'utf8',
);
const rewriteSource = readFileSync(
  new URL('../../next.config.ts', import.meta.url),
  'utf8',
);

describe('R26 administrator control center contracts', () => {
  it('exposes every real administrator ledger instead of placeholder pages', () => {
    for (const label of [
      '项目台账',
      '工序台账',
      '组织与人员',
      '分工配置',
      '角色权限',
      '流程模板',
      '基础字典',
      '审计与异常',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(componentSource).not.toContain('已创建骨架');
    expect(rewriteSource).toContain("source: '/admin/:section'");
  });

  it('uses server pagination, saved views and filtered export', () => {
    expect(clientSource).toContain('/admin/saved-views');
    expect(clientSource).toContain('/admin/tasks/export');
    expect(componentSource).toContain('保存当前视图');
    expect(componentSource).toContain('导出当前筛选');
    expect(componentSource).toContain('pageSize: 20');
  });

  it('keeps workflow state fields out of administrator write payloads', () => {
    for (const forbiddenWrite of [
      'nextNodeCode:',
      'currentNodeCode:',
      'workflowStatus:',
      'projectStatus:',
      'taskStatus:',
    ]) {
      expect(componentSource).not.toContain(forbiddenWrite);
    }
    expect(componentSource).toContain('影响预览');
    expect(componentSource).toContain('不会直接修改流程状态');
    expect(clientSource).toContain("'Idempotency-Key'");
  });

  it('switches complex tables to mobile read-only cards', () => {
    expect(cssSource).toContain('.admin-cc-mobile-list');
    expect(cssSource).toContain('@media (max-width: 700px)');
    expect(componentSource).toContain('请在桌面端完成编辑');
    expect(componentSource).toContain('移动端只读');
  });
});
