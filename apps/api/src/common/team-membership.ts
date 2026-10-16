import { ForbiddenException, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser } from '../modules/auth/auth.types';

// Application admission is explicit. A legacy admin role, requested department,
// or successful public registration never supplies it.
export const TEAM_BUSINESS_PERMISSIONS = ['project.read', 'project.write', 'workflow.transition', 'review.execute', 'attachment.manage', 'audit.read', 'dashboard.read'] as const;
export function isApprovedTeamMember(actor: Pick<AuthenticatedUser, 'authSource' | 'isSystemAdmin' | 'teamAccessApproved'>) {
  return actor.authSource === 'local' && (actor.isSystemAdmin || actor.teamAccessApproved === true);
}
export function assertApprovedTeamMember(actor: AuthenticatedUser) {
  if (!isApprovedTeamMember(actor)) throw new ForbiddenException('账号尚未获准使用本部门业务，请联系管理员。');
}

export const ACCOUNT_SELF_SERVICE = 'account-self-service';
export const AccountSelfService = () => SetMetadata(ACCOUNT_SELF_SERVICE, true);
