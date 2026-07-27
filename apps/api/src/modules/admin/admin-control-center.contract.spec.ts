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
    expect(serviceSource).toContain('只有超级管理员可以修改组织、人员和部门配置');
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

  it('stores the real department leader and preserves identity and history boundaries', () => {
    expect(organizationMigrationSource).toContain('leadUserId');
    expect(serviceSource).toContain('department.leadUser');
    expect(serviceSource).toContain('feishuIdentityReadOnly: true');
    expect(serviceSource).toContain('projectMembershipsPreserved');
    expect(serviceSource).toContain('assignedTasksPreserved');
    expect(serviceSource).not.toContain('feishuOpenId: input');
    expect(serviceSource).not.toContain('feishuUnionId: input');
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
