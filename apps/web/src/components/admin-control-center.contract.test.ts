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
const globalCssSource = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const r26CssSource = readFileSync(
  new URL('../styles/r26-v2.css', import.meta.url),
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

  it('centers every icon-only close control without font-glyph offsets', () => {
    expect(componentSource).toContain('aria-label="关闭" onClick={onClose}><CloseIcon />');
    expect(componentSource).not.toContain('aria-label="关闭" onClick={onClose}>×');
    expect(cssSource).toContain('.admin-cc-dialog > header > button svg');
    expect(cssSource).toContain('place-items: center;');
    expect(cssSource).toContain('padding: 0;');
    expect(cssSource).toContain('line-height: 0;');
    expect(globalCssSource).toContain('.r25a-audit-drawer > header .r22-icon-button svg');
    expect(r26CssSource).toContain('.r26-task-detail__header > button svg');
    expect(r26CssSource).toContain('.r26-gate3-drawer > header svg');
    expect(r26CssSource).toContain('line-height: 0;');
  });

  it('removes saved views and keeps ledger toolbars focused on current work', () => {
    expect(clientSource).not.toContain('/admin/saved-views');
    expect(componentSource).not.toContain('保存视图');
    expect(componentSource).not.toContain('保存当前视图');
    expect(componentSource).not.toContain('fetchAdminSavedViews');
    expect(componentSource).not.toContain('saveAdminView');
    for (const removedTaskUtility of [
      '导出当前筛选',
      '下载导入模板',
      '导入计划日期',
    ]) {
      expect(componentSource).not.toContain(removedTaskUtility);
    }
    expect(componentSource).not.toContain('显示完整列');
    expect(componentSource).not.toContain('使用精简列');
    expect(componentSource).not.toContain('fullColumns');
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

  it('keeps assignment editing complete while removing gray helper copy from the table', () => {
    const assignmentTableStart = componentSource.indexOf('function AssignmentsTable');
    const assignmentTableEnd = componentSource.indexOf('function PermissionsTable', assignmentTableStart);
    const assignmentTableSource = componentSource.slice(assignmentTableStart, assignmentTableEnd);
    expect(assignmentTableSource).toContain('编辑分工');
    expect(assignmentTableSource).toContain('onEdit(item)');
    expect(assignmentTableSource).not.toContain('<small>');
    expect(assignmentTableSource).not.toContain('admin-cc-field-schema');
    expect(assignmentTableSource).not.toContain('项目分工版本');
    expect(assignmentTableSource).not.toContain('引用字段 · 编辑');
    expect(assignmentTableSource).not.toContain('人员字段 · 编辑');
    expect(assignmentTableSource).not.toContain('非评审节点');
    expect(componentSource).toContain("SUGGESTED: '建议匹配'");
    expect(cssSource).toContain('.admin-cc-status--suggested');
    expect(clientSource).toContain('previewAdminNodeAssignment');
    expect(clientSource).toContain('updateAdminNodeAssignment');
    expect(componentSource).toContain('变更原因');
    expect(componentSource).toContain('确认执行变更');
    expect(cssSource).toContain('.admin-cc-editable-cell');
    expect(cssSource).toContain('.admin-cc-person-field');
    expect(cssSource).not.toContain('.admin-cc-field-schema');
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
    expect(clientSource).toContain('previewAdminProjectMember');
    expect(clientSource).toContain('removeAdminProjectMember');
    expect(cssSource).toContain('.admin-cc-organization-toolbar');
  });

  it('keeps the company department screen concise and saves without an impact-preview step', () => {
    const departmentTab = componentSource.indexOf("['departments', '公司部门']");
    const userTab = componentSource.indexOf("['users', '系统用户']");
    expect(departmentTab).toBeGreaterThan(-1);
    expect(departmentTab).toBeLessThan(userTab);
    expect(componentSource).toContain("['部门', '所属事业部', '负责人', '人数', '活跃任务', '配置节点', '状态']");
    expect(componentSource).toContain('<Field label="所属事业部">');
    expect(componentSource).toContain('state.response.directory.businessDivisions.map');
    expect(componentSource).toContain('state.response.directory.businessDivisions.some');
    expect(componentSource).toContain('请选择所属事业部');
    expect(componentSource).not.toContain('未设置所属事业部');
    expect(clientSource).toContain('businessDivisions: Array<');
    expect(componentSource).not.toContain('<Field label="上级部门">');
    expect(componentSource).not.toContain("['部门', '编码', '上级部门'");
    expect(componentSource).not.toContain('<small>{readText(row.path)}</small>');
    expect(componentSource).not.toContain("readNestedText(row.department, 'name') || readText(row.code)");
    expect(componentSource).not.toContain('所有变更先预览影响，并经过版本校验、幂等保护与审计记录。');
    expect(componentSource).not.toContain("state.kind === 'department' ||");
    expect(componentSource).not.toContain('previewAdminDepartmentConfiguration');
    expect(clientSource).not.toContain('previewAdminDepartmentConfiguration');
    expect(componentSource).toContain('updateAdminDepartmentConfiguration');
    expect(componentSource).toContain('idempotencyKey: crypto.randomUUID()');
    expect(componentSource).toContain('acknowledgedConsequences: true');
    expect(componentSource).toContain("state.kind !== 'department' ? (");

    const departmentFieldsStart = componentSource.indexOf("{state.kind === 'department' ? <>");
    const departmentFieldsEnd = componentSource.indexOf("{state.kind === 'member' ? <>", departmentFieldsStart);
    const departmentFields = componentSource.slice(departmentFieldsStart, departmentFieldsEnd);
    for (const removedDepartmentField of [
      '不会直接修改流程状态',
      '部门编码',
      '显示顺序',
      '变更原因',
    ]) {
      expect(departmentFields).not.toContain(removedDepartmentField);
    }
    expect(departmentFields).toContain('部门名称');
    expect(departmentFields).toContain('所属事业部');
    expect(departmentFields).toContain('部门负责人');
    expect(departmentFields).toContain('启用此部门');
    expect(departmentFields).toContain('placeholder="输入系统用户姓名；留空表示待设置"');
    expect(departmentFields).toContain('leadUserName');
    expect(departmentFields).not.toContain('leadUserId');
    expect(departmentFields).not.toContain('<Field label="部门负责人"><select');

    const departmentSubmitStart = componentSource.indexOf("} else if (state.kind === 'department') {");
    const departmentSubmitEnd = componentSource.indexOf("} else if (state.kind === 'departmentDelete') {", departmentSubmitStart);
    const departmentSubmit = componentSource.slice(departmentSubmitStart, departmentSubmitEnd);
    expect(departmentSubmit).not.toContain('form.code');
    expect(departmentSubmit).not.toContain('form.sortOrder');
    expect(departmentSubmit).not.toContain('form.reason');
    expect(departmentSubmit).toContain('leadUserName: String(form.leadUserName).trim() || null');
    expect(departmentSubmit).not.toContain('leadUserId:');
  });

  it('supports multi-select department deletion through the audited backend command', () => {
    expect(componentSource).toContain('选择当前页全部部门');
    expect(componentSource).toContain('选择部门 ${readText(row.name)}');
    expect(componentSource).toContain('删除所选部门');
    expect(componentSource).toContain('确认删除部门');
    expect(componentSource).toContain('部门删除不可撤销');
    expect(componentSource).toContain('deleteAdminDepartments');
    expect(clientSource).toContain('/admin/organization/departments/batch-delete');
    expect(componentSource).toContain('departmentVersion: readText(row.dataVersion)');
    expect(componentSource).toContain('acknowledgedConsequences: true');
    expect(cssSource).toContain('.admin-cc-button--danger');
  });

  it('centers table headers and cells in both axes with clear action spacing', () => {
    expect(cssSource).toMatch(
      /\.admin-cc-table th \{[\s\S]*?text-align: center;[\s\S]*?vertical-align: middle;/,
    );
    expect(cssSource).toMatch(
      /\.admin-cc-table td \{[\s\S]*?text-align: center;[\s\S]*?vertical-align: middle;/,
    );
    expect(cssSource).toContain(
      '.admin-cc-row-actions { display: flex; align-items: center; justify-content: center; gap: 14px;',
    );
    expect(cssSource).toMatch(
      /\.admin-cc-editable-cell \{[\s\S]*?justify-items: center;[\s\S]*?text-align: center;/,
    );
    expect(globalCssSource).toMatch(
      /\.data-table th,[\s\S]*?\.data-table td \{[\s\S]*?text-align: center;[\s\S]*?vertical-align: middle;/,
    );
    expect(globalCssSource).toMatch(
      /\.r25a-audit-table th,[\s\S]*?\.r25a-audit-table td \{[\s\S]*?text-align: center;[\s\S]*?vertical-align: middle;/,
    );
    expect(r26CssSource).toMatch(
      /\.r26-assignment-table__row \{[\s\S]*?align-items: center;[\s\S]*?text-align: center;/,
    );
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

  it('keeps the permission role column clean and the edit action horizontal', () => {
    expect(componentSource).not.toContain("<small>{role.code} · {role.locked ? '系统角色' : '自定义角色'}</small>");
    expect(componentSource).not.toContain('<small>{role.code}</small>');
    expect(componentSource).toContain('className="admin-cc-permission-action"');
    expect(componentSource).toContain('admin-cc-role-edit');
    expect(cssSource).toMatch(
      /\.admin-cc-role-edit \{[\s\S]*?white-space: nowrap;[\s\S]*?word-break: keep-all;[\s\S]*?writing-mode: horizontal-tb;/,
    );
    expect(cssSource).toMatch(
      /\.admin-cc-matrix td:first-child strong \{ white-space: nowrap; word-break: keep-all; \}/,
    );
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
