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
const productionAcceptanceSource = readFileSync(
  new URL('../../../../scripts/deploy/gce-production-acceptance.sh', import.meta.url),
  'utf8',
);
const buildInfoSource = readFileSync(
  new URL('../app/build-info/route.ts', import.meta.url),
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
      '审计与异常',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(componentSource).not.toContain('已创建骨架');
    expect(componentSource).not.toContain('流程模板');
    expect(componentSource).not.toContain('基础字典');
    expect(rewriteSource).toContain("source: '/admin/:section'");
  });

  it('keeps the task ledger toolbar focused on search only', () => {
    expect(clientSource).toContain('/admin/saved-views');
    expect(componentSource).toContain('保存当前视图');
    expect(componentSource).toContain("section !== 'tasks'");
    for (const removedTaskUtility of [
      '导出当前筛选',
      '下载导入模板',
      '导入计划日期',
    ]) {
      expect(componentSource).not.toContain(removedTaskUtility);
    }
    expect(componentSource).toContain('显示完整列');
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

  it('provides a typed, preview-first assignment grid instead of a read-only matrix', () => {
    for (const label of [
      '关联字段',
      '单选人员',
      '多选人员',
      '生效范围 · 单选',
      '变更原因',
      '编辑分工',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(clientSource).toContain('previewAdminNodeAssignment');
    expect(clientSource).toContain('updateAdminNodeAssignment');
    expect(componentSource).toContain('项目分工版本');
    expect(componentSource).toContain('确认执行变更');
    expect(cssSource).toContain('.admin-cc-editable-cell');
    expect(cssSource).toContain('.admin-cc-person-field');
  });

  it('switches complex tables to mobile read-only cards', () => {
    expect(cssSource).toContain('.admin-cc-mobile-list');
    expect(cssSource).toContain('@media (max-width: 700px)');
    expect(componentSource).toContain('请在桌面端完成编辑');
  });

  it('exposes full super-administrator organization controls instead of a read-only ledger', () => {
    for (const label of [
      '新增系统用户',
      '编辑全部参数',
      '新增公司部门',
      '编辑部门',
      '添加项目成员',
      '编辑职责',
      '移出项目',
      '部门负责人',
      '授予超级管理员权限',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(clientSource).toContain('previewAdminUserConfiguration');
    expect(clientSource).toContain('previewAdminDepartmentConfiguration');
    expect(clientSource).toContain('previewAdminProjectMember');
    expect(clientSource).toContain('removeAdminProjectMember');
    expect(cssSource).toContain('.admin-cc-organization-toolbar');
  });

  it('lets only a super administrator edit role names and every server permission', () => {
    expect(componentSource).toContain('编辑角色权限');
    expect(componentSource).toContain('保存角色权限');
    expect(componentSource).toContain('角色名称');
    expect(componentSource).toContain('权限设置');
    expect(componentSource).toContain('response.actions.map');
    expect(componentSource).toContain('updateAdminRolePermissions');
    expect(componentSource).toContain('draftPermissionCodes.includes');
    expect(componentSource).toContain('response.enforcement.canEdit');
    expect(clientSource).toContain('/admin/permissions/${encodeURIComponent(roleId)}');
    expect(componentSource).toContain('acknowledgedConsequences: true');
    expect(cssSource).toContain('.admin-cc-permission-editor');
    expect(cssSource).toContain('.admin-cc-permission-options button');
  });

  it('keeps project-member removal preview-first and limits transfers to real project members', () => {
    expect(componentSource).toContain("scope: state.mode === 'remove' ? 'CONFIRM_IN_PROGRESS' : 'FUTURE_ONLY'");
    expect(componentSource).toContain('confirmedInProgressTaskIds');
    expect(componentSource).toContain('逐项确认进行中任务转交');
    expect(componentSource).toContain('projectMemberUsers(directory');
    expect(componentSource).toContain('正在读取当前项目的有效成员');
    expect(clientSource).toContain('previewAdminProjectMember');
    expect(clientSource).toContain('removeAdminProjectMember');
  });

  it('captures form event values before React state updater callbacks run', () => {
    expect(componentSource).not.toMatch(
      /setForm\(\([^)]*\) => \(\{[^}]*event\.currentTarget\.(?:value|checked)/,
    );
    expect(componentSource).toContain(
      'const value = event.currentTarget.value; setForm',
    );
    expect(componentSource).toContain(
      'const checked = event.currentTarget.checked; setForm',
    );
  });

  it('lets a super administrator type a custom primary department name', () => {
    expect(componentSource).toContain('主责部门名称 · 可输入关联字段');
    expect(componentSource).toContain('list="admin-node-department-options"');
    expect(componentSource).toContain('输入现有或新的部门名称');
    expect(componentSource).toContain('primaryDepartmentName: value');
    expect(componentSource).toContain('新名称将在确认后创建为真实公司部门');
    expect(componentSource).not.toContain(
      '<Field label="主责部门 · 关联字段">',
    );
    expect(clientSource).toContain("| 'CREATABLE_REFERENCE'");
  });

  it('does not leak legacy reviewer values into ordinary node assignment writes', () => {
    expect(componentSource).toContain(
      'reviewerUserIds: readBoolean(state.row.isReviewNode)',
    );
    expect(componentSource).toContain(
      "readBoolean(item.isReviewNode) ? namesFromUnknown(item.reviewers) : '—'",
    );
  });

  it('rejects a production release that still serves administrator placeholders', () => {
    expect(productionAcceptanceSource).toContain('EXPECTED_RUNTIME_COMMIT');
    expect(productionAcceptanceSource).toContain('admin_route_real');
    expect(productionAcceptanceSource).toContain('admin_placeholder_build_count');
    expect(productionAcceptanceSource).toContain('AdminControlCenter');
    expect(buildInfoSource).toContain('runtimeCommit');
    expect(buildInfoSource).toContain("'Cache-Control': 'no-store, max-age=0'");
  });
});
