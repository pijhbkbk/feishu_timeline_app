import { describe, expect, it } from 'vitest';
import { eligibleNotificationRecipientWhere } from './notification-recipient.rules';
import { eligibleTeamUserWhere } from '../personnel/team-assignment';

describe('notification qualification independent of assignment policy', () => {
  it('requires a current local account and approved membership or existing administrator authority', () => {
    expect(eligibleNotificationRecipientWhere()).toEqual({
      status: 'ACTIVE',
      localCredential: { isNot: null },
      OR: [{ teamAccessApproved: true }, { isSystemAdmin: true }],
    });
  });

  it('does not change the separate role-based assignment candidate policy', () => {
    expect(eligibleTeamUserWhere('quality_engineer')).toEqual({
      status: 'ACTIVE',
      localCredential: { isNot: null },
      userRoles: { some: { role: { code: 'quality_engineer', status: 'ACTIVE' } } },
    });
  });
});
