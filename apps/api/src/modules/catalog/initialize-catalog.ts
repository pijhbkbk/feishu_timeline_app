import { AuditTargetType, Prisma, PrismaClient, ProcessTemplateStatus, RoleStatus } from '@prisma/client';

import { NATIVE_ADMIN_LOCK } from '../auth/native-auth.rules';
import {
  baseRoles, buildWorkCalendarEntries, businessDivisionDepartments, defaultCalendarYears,
  defaultProcessTemplate, projectStatusItems, rolePermissionMap, systemParameters, workflowNodes,
} from './base-catalog';

export const CATALOG_INITIALIZATION_ACTION = 'NATIVE_CATALOG_INITIALIZED';
export const CATALOG_VERSION = 'native-business-catalog-v1';

// These identifiers and descriptions come from the two committed data migrations.
// Accept only that pristine baseline, preserving all its IDs, values and timestamps.
export const migrationAuditor = {
  id: 'plan-a-auditor-role', code: 'auditor', name: '审计人员',
  description: '只读查看全局审计日志，不具备业务写权限。', status: RoleStatus.ACTIVE, isSystem: true,
};
export const migrationAuditorPermissions = [
  { id: 'plan-a-auditor-project-read', roleId: migrationAuditor.id, permissionCode: 'project.read', description: '读取项目基本信息' },
  { id: 'plan-a-auditor-audit-read', roleId: migrationAuditor.id, permissionCode: 'audit.read', description: '读取全局审计日志' },
  { id: 'plan-a-auditor-dashboard-read', roleId: migrationAuditor.id, permissionCode: 'dashboard.read', description: '读取工作台汇总' },
];
const migrationDepartmentIds = [
  'business_division_technology', 'business_division_cv_marketing', 'business_division_pv_marketing',
  'business_division_manufacturing', 'business_division_international', 'business_division_procurement',
];
export const migrationDepartments = businessDivisionDepartments.map((department, index) => ({
  ...department, id: migrationDepartmentIds[index]!, parentId: null, leadUserId: null, isActive: true,
}));

// Only static identifiers generated from this build's Prisma schema become SQL.
// Every application table is locked and checked, including future added models.
const applicationTables = Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name).sort();
const baselineTables = new Set(['roles', 'role_permissions', 'departments']);
function identifier(value: string) { return Prisma.raw(`"${value.replace(/"/g, '""')}"`); }

export function assertMigrationBaseline(
  actual: readonly Record<string, unknown>[], expected: readonly Record<string, unknown>[],
) {
  if (actual.length !== expected.length || expected.some(row => {
    const found = actual.find(candidate => candidate.id === row.id);
    return !found || Object.entries(row).some(([key, value]) => found[key] !== value);
  })) throw new Error('Fresh catalog requires the unchanged migration reference baseline.');
}

/** Host CLI only. Run once after migrations, BEFORE creating any user. Never run on restore. */
export async function initializeCatalog(prisma: PrismaClient) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '25s'`;
    // Same order as native administrator mutations; the table locks also serialize
    // registrations and other writers that do not take this advisory lock.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${NATIVE_ADMIN_LOCK}))`);
    await tx.$executeRaw(Prisma.sql`LOCK TABLE ${Prisma.join(applicationTables.map(identifier))} IN SHARE ROW EXCLUSIVE MODE`);
    const installedTables = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
      ORDER BY table_name`;
    const expectedTables = [...applicationTables, '_prisma_migrations'].sort();
    if (installedTables.length !== expectedTables.length || installedTables.some((table, index) => table.name !== expectedTables[index])) {
      throw new Error('Fresh catalog schema must match this build; unknown tables are not an empty installation.');
    }
    const [migrationState] = await tx.$queryRaw<Array<{ ready: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = '20260912190000_native_accounts' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS ready`;
    if (!migrationState?.ready) throw new Error('Complete migrations before initializing the fresh catalog.');
    for (const table of applicationTables) {
      if (baselineTables.has(table)) continue;
      const [result] = await tx.$queryRaw<Array<{ populated: boolean }>>(
        Prisma.sql`SELECT EXISTS (SELECT 1 FROM ${identifier(table)}) AS populated`,
      );
      if (!result || result.populated) throw new Error('Catalog initialization requires a fresh empty business database; restore and re-run are forbidden.');
    }
    assertMigrationBaseline(await tx.role.findMany(), [migrationAuditor]);
    assertMigrationBaseline(await tx.rolePermission.findMany(), migrationAuditorPermissions);
    assertMigrationBaseline(await tx.department.findMany(), migrationDepartments);

    for (const role of baseRoles) {
      if (role.code === 'auditor') continue;
      const created = await tx.role.create({ data: { ...role, status: RoleStatus.ACTIVE, isSystem: true } });
      await tx.rolePermission.createMany({ data: rolePermissionMap[role.code].map(permissionCode => ({ roleId: created.id, permissionCode })) });
    }
    await tx.processTemplate.create({ data: { ...defaultProcessTemplate, status: ProcessTemplateStatus.ACTIVE, isDefault: true } });
    for (const node of workflowNodes) await tx.workflowNodeDefinition.create({ data: node });
    await tx.systemEnumItem.createMany({ data: projectStatusItems.map(status => ({ ...status, category: 'PROJECT_STATUS', isActive: true })) });
    await tx.systemParameter.createMany({ data: systemParameters.map(parameter => ({ ...parameter, isActive: true })) });
    // Existing weekday defaults only: this does not invent official holiday data.
    await tx.workCalendar.createMany({ data: defaultCalendarYears.flatMap(buildWorkCalendarEntries) });
    const result = {
      version: CATALOG_VERSION, roles: baseRoles.length, workflowNodes: workflowNodes.length,
      processTemplates: 1, enumItems: projectStatusItems.length, systemParameters: systemParameters.length,
      calendarYears: [...defaultCalendarYears], departmentsPreserved: migrationDepartments.length,
    };
    await tx.auditLog.create({ data: {
      actorUserId: null, targetType: AuditTargetType.SYSTEM, targetId: CATALOG_VERSION,
      action: CATALOG_INITIALIZATION_ACTION, summary: '主机首次初始化正式业务基础目录（无账号或演示数据）',
      metadata: result,
    } });
    return result;
  }, { maxWait: 5_000, timeout: 30_000 });
}
