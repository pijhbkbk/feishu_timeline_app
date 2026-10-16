import type { SessionUser } from './auth-client';
// The server-issued approval is explicit and never inferred from a chosen job.
export function canCreateColorProject(user: Pick<SessionUser, 'isSystemAdmin' | 'teamAccessApproved'> | null | undefined) {
  return Boolean(user && (user.isSystemAdmin || user.teamAccessApproved));
}
