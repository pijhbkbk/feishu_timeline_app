import { describe, expect, it, vi } from 'vitest';
import { authorizeSheetAttachmentTarget } from './sheet-attachment-policy';
import type { AuthenticatedUser } from '../auth/auth.types';

const actor = { authSource: 'local', teamAccessApproved: true, isSystemAdmin: false } as AuthenticatedUser;
describe('sheet attachment authorization and inspection freeze', () => {
  it('refuses legacy targets even with a valid team actor', async () => {
    await expect(authorizeSheetAttachmentTarget({} as never, 'PROJECT', 'project-a', actor, {} as never)).rejects.toThrow('归属');
  });
  it('requires a current real business record and team admission', async () => {
    const db = { personProfile: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(authorizeSheetAttachmentTarget(db as never, 'SHEET_PERSON', 'missing', actor, {} as never)).rejects.toMatchObject({ status: 404 });
    await expect(authorizeSheetAttachmentTarget(db as never, 'SHEET_PERSON', 'missing', { ...actor, teamAccessApproved: false }, {} as never)).rejects.toMatchObject({ status: 403 });
  });
  it('keeps submitted inspection evidence readable and refuses mutations after the common activity row lock', async () => {
    const events: string[] = [];
    const db = {
      inspectionOccurrence: { findUnique: vi.fn().mockResolvedValue({ id: 'occurrence-a', activityId: 'activity-a' }) },
      inspectionActivity: {
        findUniqueOrThrow: vi.fn().mockImplementation(async () => { events.push('read'); return { projectId: 'project-a', reviewRecord: { submittedAt: new Date() } }; }),
        findUnique: vi.fn().mockImplementation(async () => { events.push('read'); return { projectId: 'project-a', reviewRecord: { submittedAt: new Date() } }; }),
      },
      $executeRaw: vi.fn().mockImplementation(async () => { events.push('project-lock'); }),
      $queryRaw: vi.fn().mockImplementation(async () => { events.push('activity-row-lock'); }),
    };
    const access = { assertProjectAccess: vi.fn().mockImplementation(async () => { events.push('project-access'); }) };
    await expect(authorizeSheetAttachmentTarget(db as never, 'SHEET_INSPECTION', 'occurrence-a', actor, access as never)).resolves.toMatchObject({ id: 'occurrence-a' });
    expect(db.$queryRaw).not.toHaveBeenCalled(); events.length = 0;
    await expect(authorizeSheetAttachmentTarget(db as never, 'SHEET_INSPECTION', 'occurrence-a', actor, access as never, true)).rejects.toMatchObject({ status: 409 });
    expect(events).toEqual(['read', 'project-access', 'project-lock', 'activity-row-lock', 'read']);
  });
  it('does not pass a null project into project authorization', async () => {
    const db = {
      inspectionOccurrence: { findUnique: vi.fn().mockResolvedValue({ id: 'occurrence-a', activityId: 'activity-a' }) },
      inspectionActivity: { findUniqueOrThrow: vi.fn().mockResolvedValue({ projectId: null, reviewRecord: null }), findUnique: vi.fn().mockResolvedValue({ projectId: null, reviewRecord: null }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const access = { assertProjectAccess: vi.fn() };
    await authorizeSheetAttachmentTarget(db as never, 'SHEET_INSPECTION', 'occurrence-a', actor, access as never, true);
    expect(access.assertProjectAccess).not.toHaveBeenCalled(); expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
