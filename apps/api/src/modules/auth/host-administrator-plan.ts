import { BadRequestException } from '@nestjs/common';
import { normalizeLoginName } from './native-auth.rules';

export type HostAdministratorPlan = {
  maintenanceId: string;
  userId: string;
  expectedLoginName: string;
  expectedName: string;
  expectedUpdatedAt: string;
  expectedAuthVersion: number;
  expectedIsSystemAdmin: boolean;
  expectedRoleIds: string[];
  reason: string;
};

export function validateHostAdministratorPlan(value: unknown): HostAdministratorPlan {
  const fail = () => { throw new BadRequestException('主机授权计划字段或预期身份无效。'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const keys = ['maintenanceId', 'userId', 'expectedLoginName', 'expectedName', 'expectedUpdatedAt', 'expectedAuthVersion', 'expectedIsSystemAdmin', 'expectedRoleIds', 'reason'];
  if (Object.keys(v).length !== keys.length || keys.some(key => !(key in v))) return fail();
  if (typeof v.maintenanceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.maintenanceId)) return fail();
  if (typeof v.userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v.userId)) return fail();
  if (typeof v.expectedLoginName !== 'string' || normalizeLoginName(v.expectedLoginName) !== v.expectedLoginName) return fail();
  if (typeof v.expectedName !== 'string' || !v.expectedName.trim() || v.expectedName.length > 80) return fail();
  if (typeof v.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(v.expectedUpdatedAt)) || new Date(v.expectedUpdatedAt).toISOString() !== v.expectedUpdatedAt) return fail();
  if (!Number.isSafeInteger(v.expectedAuthVersion) || (v.expectedAuthVersion as number) < 0 || typeof v.expectedIsSystemAdmin !== 'boolean') return fail();
  if (!Array.isArray(v.expectedRoleIds) || v.expectedRoleIds.length > 64 || v.expectedRoleIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) || new Set(v.expectedRoleIds).size !== v.expectedRoleIds.length) return fail();
  if (typeof v.reason !== 'string' || v.reason.trim().length < 1 || v.reason.length > 200 || Array.from(v.reason).some(char => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)) return fail();
  return {
    maintenanceId: v.maintenanceId.toLowerCase(), userId: v.userId,
    expectedLoginName: v.expectedLoginName, expectedName: v.expectedName,
    expectedUpdatedAt: v.expectedUpdatedAt, expectedAuthVersion: v.expectedAuthVersion as number,
    expectedIsSystemAdmin: v.expectedIsSystemAdmin, expectedRoleIds: [...v.expectedRoleIds].sort() as string[], reason: v.reason.trim(),
  };
}
