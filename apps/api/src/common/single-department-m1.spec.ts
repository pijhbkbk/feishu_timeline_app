import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { assertCurrentTeamActor, assertTeamTaskOperator, canOperateTeamTask } from './team-authorization';
import { assertApprovedTeamMember, TEAM_BUSINESS_PERMISSIONS } from './team-membership';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import { ApprovedReportDto, ApprovedReportService } from '../modules/projects/approved-report.service';
import { SamplesService } from '../modules/samples/samples.service';
import { PersonnelChangeDto } from '../modules/personnel/personnel.dto';
import { SessionAuthGuard } from '../modules/auth/session-auth.guard';
import { PUBLIC_ROUTE_KEY } from '../modules/auth/auth.constants';
import { ACCOUNT_SELF_SERVICE } from './team-membership';

const actor: AuthenticatedUser = { id: 'member-a', username: 'member-a', name: '合成工艺成员', email: null, departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: 1, roleCodes: [], permissionCodes: [...TEAM_BUSINESS_PERMISSIONS] };
const version = '2026-09-20T00:00:00.000Z';
const reportInput = { taskId: 'task-1', taskVersion: version, reportAttachmentId: 'file-1', approvedReportDate: '2026-09-18', approvalReference: '合成获批报告编号 M1', demandSource: '合成市场需求', idempotencyKey: 'intake-1' };
const confirmation = { taskId: 'task-4', taskVersion: version, idempotencyKey: 'confirmation-1', actualConfirmedAt: '2026-09-18', confirmationParty: '营销业务方', confirmationAttachmentId: 'file-4', sampleId: 'sample-1', decision: 'APPROVE' };

function dbWithActor(overrides = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', authVersion: 1, isSystemAdmin: false, teamAccessApproved: true, userRoles: [], ...overrides }) },
    r26CommandRequest: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue({ id: 'task-1', projectId: 'project-1', workflowInstanceId: 'workflow-1', updatedAt: new Date(version) }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'task-2', updatedAt: new Date(version) }) },
    project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'project-1', name: '合成暖灰色', approvedReportAttachmentId: null }), update: vi.fn().mockResolvedValue({}) },
    attachment: { findFirst: vi.fn().mockResolvedValue({ id: 'file-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    developmentReport: { create: vi.fn().mockResolvedValue({ id: 'report-1' }) },
  };
  return { tx, prisma: { $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)) } };
}

describe('single department admission and M1 facts', () => {
  it('keeps public session/metadata routes public and rejects undecorated business reads by default', async () => {
    const request = { cookies: { ft_session: 'test' } };
    const context = { getHandler: () => () => undefined, getClass: () => Object, switchToHttp: () => ({ getRequest: () => request }) };
    const getUser = vi.fn().mockResolvedValue({ ...actor, teamAccessApproved: false, roleCodes: ['admin'] });
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const guard = new SessionAuthGuard(reflector as never, { get: () => 'ft_session' } as never, { getAuthenticatedUserFromSessionToken: getUser } as never);
    await expect(guard.canActivate(context as never)).rejects.toThrow('尚未获准');
    reflector.getAllAndOverride.mockImplementation((key: string) => key === PUBLIC_ROUTE_KEY);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    reflector.getAllAndOverride.mockImplementation((key: string) => key === ACCOUNT_SELF_SERVICE);
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
  it('allows either admitted member to operate an unclaimed or another member task', () => {
    const task = { nodeCode: 'SAMPLE_COLOR_CONFIRMATION' as const, assigneeUserId: 'someone-else' };
    expect(canOperateTeamTask(task, actor)).toBe(true);
    expect(() => assertTeamTaskOperator({ ...task, assigneeUserId: null }, { ...actor, id: 'member-b' })).not.toThrow();
  });
  it.each([{ roleCodes: [] }, { roleCodes: ['admin'] }, { roleCodes: ['project_manager'] }, { roleCodes: ['process_engineer'] }])('does not infer admission from legacy roles $roleCodes', ({ roleCodes }) => {
    expect(() => assertApprovedTeamMember({ ...actor, teamAccessApproved: false, roleCodes: roleCodes as AuthenticatedUser['roleCodes'] })).toThrow('尚未获准');
  });
  it('uses the explicit native system administrator as an approved entry, never mock identity', () => {
    expect(() => assertApprovedTeamMember({ ...actor, isSystemAdmin: true, teamAccessApproved: false })).not.toThrow();
    expect(() => assertApprovedTeamMember({ ...actor, authSource: 'mock' })).toThrow();
  });
  it('rejects a revocation committed while a writer was waiting', async () => {
    const { tx } = dbWithActor({ teamAccessApproved: false, authVersion: 2 });
    await expect(assertCurrentTeamActor(tx as never, actor)).rejects.toThrow('授权已变化');
  });
  it('accepts explicit business permissions without manufacturing persisted roles', async () => {
    const { tx } = dbWithActor();
    await expect(assertCurrentTeamActor(tx as never, actor)).resolves.toBeUndefined();
  });
  it.each([20260918, true, null])('rejects implicitly convertible approval dates %j', async approvedReportDate => {
    const dto = plainToInstance(ApprovedReportDto, { ...reportInput, approvedReportDate }, { enableImplicitConversion: true });
    expect((await validate(dto)).some(error => error.property === 'approvedReportDate')).toBe(true);
  });
  it.each(['true', 1, null])('does not coerce admission input %j', async teamAccessApproved => {
    const dto = plainToInstance(PersonnelChangeDto, { teamAccessApproved, expectedVersion: version, requestId: '4123e765-cc75-40df-8792-7b6df4f058fb', reason: '合成许可' }, { enableImplicitConversion: true });
    expect((await validate(dto)).some(error => error.property === 'teamAccessApproved')).toBe(true);
  });
  it('records real intake facts and transitions 01 then 02 through the workflow service', async () => {
    const { tx, prisma } = dbWithActor(); const transition = vi.fn().mockResolvedValue({});
    const service = new ApprovedReportService(prisma as never, { transitionTaskWithExecutor: transition } as never);
    await service.register('project-1', reportInput, actor);
    expect(tx.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ approvedReportDate: new Date('2026-09-18T00:00:00.000Z'), approvedReportAttachmentId: 'file-1' }) }));
    expect(transition.mock.calls.map(call => call[1])).toEqual(['task-1', 'task-2']);
    expect(tx.developmentReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: actor.id, demandSource: reportInput.demandSource, status: 'SUBMITTED' }) }));
  });
  it('requires the clean report attachment to match project, task, and material purpose', async () => {
    const { tx, prisma } = dbWithActor(); tx.attachment.findFirst.mockResolvedValue(null);
    const service = new ApprovedReportService(prisma as never, {} as never);
    await expect(service.register('project-1', reportInput, actor)).rejects.toThrow('安全扫描通过');
    expect(tx.attachment.findFirst).toHaveBeenCalledWith({ where: { id: 'file-1', projectId: 'project-1', entityType: 'WORKFLOW_TASK', entityId: 'task-1', isDeleted: false, scanStatus: 'CLEAN', materialType: 'approved-development-report' } });
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it('rejects stale intake without overwriting facts', async () => {
    const { tx, prisma } = dbWithActor();
    const service = new ApprovedReportService(prisma as never, {} as never);
    await expect(service.register('project-1', { ...reportInput, taskVersion: '2026-09-19T00:00:00.000Z' }, actor)).rejects.toThrow('建项进度已变化');
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it('replays successful intake without new report, audit, or transition', async () => {
    const { tx, prisma } = dbWithActor(); const transition = vi.fn().mockResolvedValue({});
    const service = new ApprovedReportService(prisma as never, { transitionTaskWithExecutor: transition } as never);
    await service.register('project-1', reportInput, actor);
    const saved = tx.r26CommandRequest.create.mock.calls[0]?.[0] as unknown as { data: Record<string, unknown> };
    tx.r26CommandRequest.findUnique.mockResolvedValue(saved.data as never);
    const result = await service.register('project-1', reportInput, actor);
    expect(result.idempotentReplay).toBe(true); expect(transition).toHaveBeenCalledTimes(2); expect(tx.developmentReport.create).toHaveBeenCalledTimes(1);
    await expect(service.register('project-1', { ...reportInput, approvalReference: 'changed' }, actor)).rejects.toThrow('其他内容');
  });
  it('distinguishes actual confirmation date, external party, and author', () => {
    const service = new SamplesService({} as never, {} as never, {} as never, {} as never, {} as never);
    const parsed = (service as unknown as { parseConfirmationInput(input: unknown): Record<string, unknown> }).parseConfirmationInput(confirmation);
    expect(parsed.actualConfirmedAt).toEqual(new Date('2026-09-18T00:00:00.000Z')); expect(parsed.confirmationParty).toBe('营销业务方');
    expect(parsed).not.toHaveProperty('confirmedById');
  });
  it.each([20260918, '2026-02-30', '2999-01-01', 'invalid'])('rejects malformed or future actual date %j', actualConfirmedAt => {
    const service = new SamplesService({} as never, {} as never, {} as never, {} as never, {} as never);
    expect(() => (service as unknown as { parseConfirmationInput(input: unknown): unknown }).parseConfirmationInput({ ...confirmation, actualConfirmedAt })).toThrow();
  });
  it('accepts Shanghai today across the UTC midnight boundary but rejects tomorrow', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T17:00:00.000Z'));
    try {
      const { prisma } = dbWithActor();
      const service = new ApprovedReportService(prisma as never, { transitionTaskWithExecutor: vi.fn() } as never);
      await expect(service.register('project-1', { ...reportInput, approvedReportDate: '2026-10-09' }, actor)).resolves.toBeDefined();
      await expect(service.register('project-1', { ...reportInput, approvedReportDate: '2026-10-10' }, actor)).rejects.toThrow('有效的报告批准日期');
      const samples = new SamplesService({} as never, {} as never, {} as never, {} as never, {} as never);
      const parse = Reflect.get(samples, 'parseConfirmationInput').bind(samples);
      expect(parse({ ...confirmation, actualConfirmedAt: '2026-10-09' }).actualConfirmedAt.toISOString()).toBe('2026-10-09T00:00:00.000Z');
      expect(() => parse({ ...confirmation, actualConfirmedAt: '2026-10-10' })).toThrow('晚于今天');
      const parseSample = Reflect.get(samples, 'parseSampleWriteInput').bind(samples);
      expect(parseSample({ sampleNo: 'M1-01', sampleName: '样板', producedAt: '2026-10-09' }).producedAt.toISOString()).toBe('2026-10-09T00:00:00.000Z');
      expect(() => parseSample({ sampleNo: 'M1-01', sampleName: '样板', producedAt: '2026-10-10' })).toThrow('晚于今天');
    } finally { vi.useRealTimers(); }
  });
  it.each(['APPROVE', 'RETURN', 'REJECT'])('requires this round sample evidence for %s, preserving older records', async decision => {
    const { tx, prisma } = dbWithActor();
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([]), sampleConfirmation: { create: vi.fn() } });
    Object.assign(tx.project, { findUnique: vi.fn().mockResolvedValue({ id: 'project-1', requiresApprovedReport: true }) });
    const service = new SamplesService(prisma as never, {} as never, {} as never, {} as never, { assertProjectAccessWithDefaultClient: vi.fn() } as never);
    for (const [name, value] of Object.entries({ lockSampleRow: true, getSampleOrThrow: { id: 'sample-1', projectId: 'project-1', createdAt: new Date(version), updatedAt: new Date(version), isCurrent: true, status: 'DRAFT', sampleNo: 'S-1', sampleName: '旧轮样板', sampleType: 'PANEL', versionNo: 1, location: null, remark: null, producedAt: null, confirmedAt: null }, lockActiveConfirmationTaskOrThrow: { id: 'task-4', projectId: 'project-1', workflowInstanceId: 'workflow-1', updatedAt: new Date(version), payload: { fromTaskId: 'task-3-new' } }, assertProjectSampleRecordBounds: undefined })) Reflect.set(service, name, vi.fn().mockResolvedValue(value));
    await expect(service.submitConfirmation('project-1', { ...confirmation, decision }, actor)).rejects.toThrow('本轮登记的样板');
    expect(Reflect.get(tx, 'sampleConfirmation').create).not.toHaveBeenCalled();
  });

});
