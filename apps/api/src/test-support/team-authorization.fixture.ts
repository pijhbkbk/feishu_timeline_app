import { vi } from 'vitest';

type Actor = { id: string; authVersion: number; isSystemAdmin: boolean; roleCodes: readonly string[]; permissionCodes?: readonly string[] };
type Task = { id: string; nodeCode: string; assigneeUserId: string | null; isActive: boolean; status: string; projectId?: string };

/** Supplies database state, never stubs the authorization functions themselves. */
export function installTeamAuthorizationFixture(tx: Record<string, any>, actors: readonly Actor[], taskById: (id: string) => Task | null = () => null) {
  const users = new Map(actors.map(actor => [actor.id, {
    id: actor.id, status: 'ACTIVE', authVersion: actor.authVersion, isSystemAdmin: actor.isSystemAdmin,
    userRoles: actor.roleCodes.map(code => ({ role: { code, rolePermissions: (actor.permissionCodes ?? []).map(permissionCode => ({ permissionCode })) } })),
  }]));
  const originalUser = tx.user?.findUnique?.bind(tx.user);
  tx.user ??= {};
  tx.user.findUnique = vi.fn((args: { where: { id: string }; select?: { authVersion?: boolean } }) =>
    args.select?.authVersion ? Promise.resolve(users.get(args.where.id) ?? null) : originalUser?.(args));
  const originalTask = tx.workflowTask?.findUnique?.bind(tx.workflowTask);
  tx.workflowTask ??= {};
  tx.workflowTask.findUnique = vi.fn((args: { where: { id: string }; select?: { nodeCode?: boolean; projectId?: boolean } }) =>
    args.select?.nodeCode || args.select?.projectId ? Promise.resolve(taskById(args.where.id)) : originalTask?.(args));
  tx.$executeRaw ??= vi.fn().mockResolvedValue(0);
  return { users };
}
