import type { SessionUser } from './auth-client';

// Match ProjectsController: permission plus allowed role; system admin bypass is server-owned.
export function canCreateColorProject(user: Pick<SessionUser, 'isSystemAdmin' | 'roleCodes' | 'permissionCodes'> | null | undefined) {
  return Boolean(user && (user.isSystemAdmin || (user.permissionCodes?.includes('project.write') &&
    user.roleCodes.some(role => role === 'admin' || role === 'project_manager'))));
}
