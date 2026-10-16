import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TeamTasksService } from './team-tasks.service';

const purchaser = { teamAccessApproved: true, authSource: 'local', id: 'person-one', roleCodes: ['purchaser'], permissionCodes: ['project.read'], isSystemAdmin: false } as AuthenticatedUser;
const admin = { ...purchaser, id: 'administrator', isSystemAdmin: true, roleCodes: [] };
function fixture() {
  const db = { workflowTask: { findMany: vi.fn().mockResolvedValue([]) }, $queryRaw: vi.fn().mockResolvedValue([]) };
  return { db, service: new TeamTasksService(db as never) };
}
describe('team work queue query boundaries', () => {
  it('does not expose the quality shared queue when another role supplies its own assignee id', async () => {
    const { service, db } = fixture();
    expect(await service.listMonthly(purchaser, { view: 'available', assignee: purchaser.id })).toEqual({ items: [], nextCursor: null });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('rejects another person and administrator views before querying data', async () => {
    const { service, db } = fixture();
    for (const method of ['list', 'listMonthly'] as const) {
      for (const query of [{ assignee: 'other' }, { view: 'overdue' as const }, { view: 'exceptions' as const }]) {
        await expect(service[method](purchaser, query)).rejects.toMatchObject({ status: 403 });
      }
    }
    expect(db.workflowTask.findMany).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('preserves the requested ordinary overdue owner filter', async () => {
    const { service, db } = fixture();
    await service.list(admin, { view: 'overdue', assignee: 'person-two' });
    expect(db.workflowTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assigneeUserId: 'person-two' }) }));
  });
  it('binds the requested monthly overdue owner instead of returning the whole team', async () => {
    const { service, db } = fixture();
    await service.listMonthly(admin, { view: 'overdue', assignee: 'person-two' });
    const query = db.$queryRaw.mock.calls[0]![0];
    expect(query.values).toContain('person-two');
    expect(query.strings.join('?')).toContain('AND t."reviewerId" =');
  });
  it('denies unapproved access even to completed history', async () => {
    const { service } = fixture();
    const unassigned = { ...purchaser, teamAccessApproved: false, roleCodes: [], permissionCodes: [] };
    await expect(service.list(unassigned, { view: 'completed' })).rejects.toMatchObject({ status: 403 });
    await expect(service.listMonthly(unassigned, { view: 'completed' })).rejects.toMatchObject({ status: 403 });
  });
});
