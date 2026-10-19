import { describe, expect, it, vi } from 'vitest';
import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import type { AuthenticatedUser } from '../auth/auth.types';
const basis = vi.hoisted(() => vi.fn());
vi.mock('./color-exits.annual-review', () => ({ assertAnnualReviewExitBasis: basis }));
import { ColorExitsService } from './color-exits.service';

describe('first annual review threshold binding', () => {
  it.each([true, false])('uses 20 only when an existing saved annual review is bound: %s', async hasReview => {
    const actor: AuthenticatedUser = { id: 'annual-policy-user', username: 'annual-policy', name: '合成成员', email: null, departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: 1, roleCodes: [], permissionCodes: [] };
    const date = new Date('2025-10-01T00:00:00Z');
    const task = { id: 'annual-policy-task', projectId: 'annual-policy-project', nodeCode: 'PROJECT_CLOSED', assigneeUserId: actor.id, status: 'IN_PROGRESS', isActive: true };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: task.id }]), colorExit: { create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, id: 'exit-record', createdAt: date, updatedAt: date, completedAt: null })) } };
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => task);
    const service = new ColorExitsService({ $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx) } as never, { createWithExecutor: vi.fn() } as never, {} as never, { assertProjectAccess: vi.fn() } as never);
    const subject = service as unknown as Record<'getContext' | 'getBoundProjectColor' | 'assertReplacementColor' | 'buildWorkspace' | 'resolveExitPolicy', (...args: unknown[]) => Promise<unknown>>;
    vi.spyOn(subject, 'getContext').mockResolvedValue({ activeTask: task, activeRecord: null, visualDeltaApproved: true } as never);
    vi.spyOn(subject, 'getBoundProjectColor').mockResolvedValue({ id: 'annual-policy-color' } as never);
    vi.spyOn(subject, 'assertReplacementColor').mockResolvedValue(undefined as never);
    vi.spyOn(subject, 'buildWorkspace').mockResolvedValue({} as never);
    const legacy = vi.spyOn(subject, 'resolveExitPolicy').mockResolvedValue({ exitThreshold: 100, systemSuggestion: 'EXIT' } as never);
    basis.mockResolvedValue(hasReview ? { auditId: 'annual-audit' } : null);
    await service.createExitRecord(task.projectId, { exitDate: date.toISOString(), exitReason: '合成依据', statisticYear: 2025, annualOutput: 20, finalDecision: 'RETAIN', effectiveDate: date.toISOString() }, actor);
    expect(tx.colorExit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ exitThreshold: hasReview ? 20 : 100, systemSuggestion: hasReview ? 'RETAIN' : 'EXIT' }) }));
    expect(legacy).toHaveBeenCalledTimes(hasReview ? 0 : 1);
  });
});
