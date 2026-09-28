import { describe, expect, it } from 'vitest';
import { baseRoles, defaultProcessTemplate, rolePermissionMap, workflowNodes } from './base-catalog';
import { assertMigrationBaseline, migrationAuditor, migrationAuditorPermissions, migrationBusinessRoles, migrationProductionPermissions, migrationDepartments } from './initialize-catalog';

describe('fresh catalog reference checks', () => {
  it('accepts the exact migrations baseline without treating dates as newly invented values', () => {
    assertMigrationBaseline([migrationAuditor, ...migrationBusinessRoles], [migrationAuditor, ...migrationBusinessRoles]);
    expect(migrationBusinessRoles).toHaveLength(7);
    expect(migrationProductionPermissions.map(row => row.permissionCode)).toEqual(rolePermissionMap.production_operator);
    assertMigrationBaseline([{ ...migrationAuditor, createdAt: new Date(0) }], [migrationAuditor]);
    assertMigrationBaseline([...migrationAuditorPermissions].reverse(), migrationAuditorPermissions);
    assertMigrationBaseline(migrationDepartments, migrationDepartments);
  });
  it('rejects modified, missing or additional baseline rows and extra privileges', () => {
    for (const rows of [[], [{ ...migrationAuditor, status: 'INACTIVE' }], [{ ...migrationAuditor, id: 'another-id' }],
      [migrationAuditor, { ...migrationAuditor, id: 'another-id' }]]) {
      expect(() => assertMigrationBaseline(rows, [migrationAuditor])).toThrow();
    }
    expect(() => assertMigrationBaseline([...migrationAuditorPermissions, { id: 'extra', permissionCode: 'system.manage' }], migrationAuditorPermissions)).toThrow();
    expect(() => assertMigrationBaseline(migrationDepartments.map(row => ({ ...row, leadUserId: 'someone' })), migrationDepartments)).toThrow();
  });
  it('contains the existing complete catalog without assigning roles to any user', () => {
    expect(baseRoles).toHaveLength(10);
    expect(rolePermissionMap.production_operator).toEqual(['project.read', 'workflow.transition', 'attachment.manage', 'dashboard.read']);
    expect(workflowNodes).toHaveLength(18);
    expect(new Set(workflowNodes.map(node => node.stepCode)).size).toBe(18);
    expect(workflowNodes.every(node => node.processTemplateCode === defaultProcessTemplate.code)).toBe(true);
    expect(rolePermissionMap.auditor).toEqual(['project.read', 'audit.read', 'dashboard.read']);
    expect(rolePermissionMap.viewer).toEqual(['project.read', 'dashboard.read']);
    expect(migrationDepartments).toHaveLength(6);
  });
});
