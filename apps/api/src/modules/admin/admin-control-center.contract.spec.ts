import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  join(__dirname, 'admin-control-center.service.ts'),
  'utf8',
);
const controllerSource = readFileSync(
  join(__dirname, 'admin-control-center.controller.ts'),
  'utf8',
);
const dtoSource = readFileSync(
  join(__dirname, 'dto/admin-control-center.dto.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260725183000_r26_admin_control_center/migration.sql',
  ),
  'utf8',
);
const organizationMigrationSource = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260727090000_r26_admin_organization_management/migration.sql',
  ),
  'utf8',
);
const businessDivisionMigrationSource = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260805143000_add_business_division_reference_data/migration.sql',
  ),
  'utf8',
);

describe('R26 administrator control center backend contracts', () => {
  it('requires administrator role and server-side system permission', () => {
    expect(controllerSource).toContain("@Roles('admin')");
    expect(controllerSource).toContain("@Permissions('system.manage')");
  });

  it('requires idempotency and uses a database transaction for commands', () => {
    expect(controllerSource).toContain("'idempotency-key'");
    expect(controllerSource).toContain('assertIdempotencyKey');
    expect(serviceSource).toContain('this.prisma.$transaction');
    expect(serviceSource).toContain('requestHash');
    expect(serviceSource).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(migrationSource).toContain('admin_command_requests');
  });

  it('locks state-machine fields out of direct administrator updates', () => {
    const directUpdatePatterns = [
      /tx\.project\.update\([\s\S]{0,500}currentNodeCode:/,
      /tx\.project\.update\([\s\S]{0,500}status:/,
      /tx\.workflowTask\.update\([\s\S]{0,500}nodeCode:/,
      /tx\.workflowTask\.update\([\s\S]{0,500}status:/,
    ];
    for (const pattern of directUpdatePatterns) {
      expect(serviceSource).not.toMatch(pattern);
    }
    expect(serviceSource).toContain('HISTORY_LOCKED');
  });

  it('writes audit records for every controlled mutation family', () => {
    for (const action of [
      'ADMIN_PROJECT_BASIC_INFO_CHANGED',
      'ADMIN_TASK_SCHEDULE_CHANGED',
      'ADMIN_TASK_ASSIGNMENT_CHANGED',
      'ADMIN_USER_STATUS_CHANGED',
      'ADMIN_PROJECT_NODE_ASSIGNMENT_CHANGED',
    ]) {
      expect(serviceSource).toContain(action);
    }
    expect(serviceSource.match(/createWithExecutor/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('exposes a preview-first editable node-assignment command with concurrency protection', () => {
    expect(controllerSource).toContain(
      "assignments/:nodeCode/preview",
    );
    expect(controllerSource).toContain(
      "assignments/:nodeCode",
    );
    expect(serviceSource).toContain('buildNodeAssignmentPreview');
    expect(serviceSource).toContain('memberAssignmentVersion: input.expectedVersion');
    expect(serviceSource).toContain('STALE_MEMBER_ASSIGNMENT_VERSION');
    expect(serviceSource).toContain(
      'ProjectAssignmentSource.PROJECT_NODE_OVERRIDE',
    );
    expect(serviceSource).toContain('historicalTasksPreserved: true');
  });

  it('gives only super administrators preview-first control over users and departments', () => {
    expect(serviceSource).toContain('assertSuperAdministrator');
    expect(serviceSource).toContain('只有超级管理员可以修改系统管理配置');
    for (const route of [
      "organization/users/preview",
      "organization/users/:userId/preview",
      "organization/departments/preview",
      "organization/departments/:departmentId/preview",
    ]) {
      expect(controllerSource).toContain(route);
    }
    for (const action of [
      'ADMIN_USER_CREATED',
      'ADMIN_USER_CONFIGURATION_CHANGED',
      'ADMIN_DEPARTMENT_CREATED',
      'ADMIN_DEPARTMENT_CONFIGURATION_CHANGED',
    ]) {
      expect(serviceSource).toContain(action);
    }
  });

  it('deletes only unreferenced non-root departments with version, idempotency, and audit guards', () => {
    expect(controllerSource).toContain("organization/departments/batch-delete");
    expect(controllerSource).toContain('AdminDepartmentBatchDeleteDto');
    expect(dtoSource).toContain('export class AdminDepartmentDeleteRowDto');
    expect(dtoSource).toContain('export class AdminDepartmentBatchDeleteDto');
    expect(serviceSource).toContain('async deleteDepartments(');
    expect(serviceSource).toContain("action: 'ADMIN_DEPARTMENTS_DELETED'");
    expect(serviceSource).toContain("action: 'ADMIN_DEPARTMENT_DELETED'");
    expect(serviceSource).toContain("code: 'DEPARTMENT_DELETE_BLOCKED'");
    expect(serviceSource).toContain("department.parentId === null ? '组织根部门不能删除'");
    for (const relation of [
      'users: true',
      'children: true',
      'ownedProjects: true',
      'assignedWorkflowTasks: true',
      'projectNodeAssignments: true',
      'boardDistributionUsers: true',
    ]) {
      expect(serviceSource).toContain(relation);
    }
    expect(serviceSource).toContain('this.assertDateVersion(');
    expect(serviceSource).toContain('await tx.department.deleteMany');
  });

  it('lets only super administrators rename roles and change the enforced permission matrix', () => {
    expect(controllerSource).toContain("permissions/:roleId");
    expect(controllerSource).toContain('AdminRolePermissionChangeDto');
    expect(serviceSource).toContain('async changeRolePermissions(');
    expect(serviceSource).toContain("action: 'ADMIN_ROLE_PERMISSIONS_CHANGED'");
    expect(serviceSource).toContain('this.assertSuperAdministrator(actor)');
    expect(serviceSource).toContain("targetType: AuditTargetType.ROLE");
    expect(serviceSource).toContain("this.assertDateVersion(role.updatedAt, input.expectedVersion, '角色权限')");
    expect(serviceSource).toContain('unmanagedPermissionCodes');
    expect(dtoSource).toContain('export class AdminRolePermissionChangeDto');
  });

  it('stores the real department leader and preserves identity and history boundaries', () => {
    expect(organizationMigrationSource).toContain('leadUserId');
    expect(serviceSource).toContain('department.leadUser');
    expect(serviceSource).toContain('feishuIdentityReadOnly: true');
    expect(serviceSource).toContain('projectMembershipsPreserved');
    expect(serviceSource).toContain('assignedTasksPreserved');
    expect(serviceSource).not.toContain('feishuOpenId: input');
    expect(serviceSource).not.toContain('feishuUnionId: input');
  });

  it('restricts company departments to the six governed business divisions', () => {
    for (const division of [
      '技术中心',
      '商用车营销事业部',
      '乘用车营销事业部',
      '制造中心',
      '国际事业部',
      '采购中心',
    ]) {
      expect(businessDivisionMigrationSource).toContain(division);
    }
    expect(serviceSource).toContain('BUSINESS_DIVISIONS.map');
    expect(serviceSource).toContain('businessDivisions');
    expect(serviceSource).toContain('必须选择所属事业部。');
    expect(serviceSource).toContain('所属事业部只能从系统规定的六个选项中选择。');
  });

  it('keeps department code, ordering, and audit reason as server-managed fields', () => {
    const departmentDtoStart = dtoSource.indexOf('export class AdminDepartmentConfigurationPreviewDto');
    const departmentDtoEnd = dtoSource.indexOf('export class AdminDepartmentDeleteRowDto', departmentDtoStart);
    const departmentDto = dtoSource.slice(departmentDtoStart, departmentDtoEnd);
    expect(departmentDto).not.toContain('code!:');
    expect(departmentDto).not.toContain('sortOrder!:');
    expect(departmentDto).not.toContain('reason!:');
    expect(departmentDto).toContain('leadUserName?: string | null;');
    expect(departmentDto).not.toContain('leadUserId?:');

    const departmentCommand = serviceSource.slice(
      serviceSource.indexOf('async changeDepartmentConfiguration('),
      serviceSource.indexOf('async deleteDepartments('),
    );
    expect(departmentCommand).not.toContain('input.code');
    expect(departmentCommand).not.toContain('input.sortOrder');
    expect(departmentCommand).not.toContain('input.reason');
    expect(departmentCommand).toContain('this.customDepartmentCode(normalizedName)');
    expect(departmentCommand).toContain('existing?.sortOrder');
    expect(departmentCommand).toContain("reasonSource: 'SYSTEM_DEFAULT'");
    expect(departmentCommand).toContain('where: { name: normalizedLeadUserName, status: UserStatus.ACTIVE }');
    expect(departmentCommand).toContain('matchingLeadUsers.length > 1');
    expect(departmentCommand).toContain('leadUserId: leadUser?.id ?? null');
  });

  it('enters the idempotency command boundary before organization write validation', () => {
    const userCommand = serviceSource.slice(
      serviceSource.indexOf('async changeUserConfiguration('),
      serviceSource.indexOf('async previewDepartmentConfiguration('),
    );
    const departmentCommand = serviceSource.slice(
      serviceSource.indexOf('async changeDepartmentConfiguration('),
      serviceSource.indexOf('async exportTasksCsv('),
    );
    expect(userCommand).toContain('return this.executeAdminCommand({');
    expect(departmentCommand).toContain('return this.executeAdminCommand({');
    expect(userCommand).not.toContain('previewUserConfiguration(');
    expect(departmentCommand).not.toContain('previewDepartmentConfiguration(');
  });

  it('does not silently hide projects from the organization configuration directory', () => {
    const directoryMethod = serviceSource.slice(
      serviceSource.indexOf('private async getOrganizationDirectory()'),
      serviceSource.indexOf('private async refreshDepartmentDescendantPaths('),
    );
    expect(directoryMethod).toContain('this.prisma.project.findMany({');
    expect(directoryMethod).not.toContain('take:');
  });

  it('creates and audits a typed custom department before linking the node assignment', () => {
    expect(dtoSource).toContain('primaryDepartmentName?: string | null');
    expect(serviceSource).toContain("type: 'CREATABLE_REFERENCE'");
    expect(serviceSource).toContain("action: 'CREATE_AND_LINK'");
    expect(serviceSource).toContain('customDepartmentCode');
    expect(serviceSource).toContain('ADMIN_DEPARTMENT_CREATED_FROM_ASSIGNMENT');
    expect(serviceSource).toContain('primaryDepartmentId: resolvedDepartment?.id ?? null');
    expect(serviceSource).toContain('部门编码由服务端生成');
  });

  it('uses the persisted workflow definition when previewing node reviewers', () => {
    expect(serviceSource).toContain(
      'reviewers: definition.isReviewNode ? proposed.reviewers : []',
    );
  });
});
