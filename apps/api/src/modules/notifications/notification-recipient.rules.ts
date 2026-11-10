import { Prisma } from '@prisma/client';

/** Notifications follow current local business admission, not legacy job roles.
 * Assignment/transfer candidate selection remains a separate policy.
 */
export function eligibleNotificationRecipientWhere(): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    localCredential: { isNot: null },
    OR: [{ teamAccessApproved: true }, { isSystemAdmin: true }],
  };
}

/** The caller's fixed `u` alias is a users row with a local_credentials join. */
export function notificationRecipientEligibleSql() {
  return Prisma.sql`u.status = 'ACTIVE' AND (u."teamAccessApproved" = true OR u."isSystemAdmin" = true)`;
}
