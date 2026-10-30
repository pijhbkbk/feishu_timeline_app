import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ColorRegisterService } from './color-register.service';

const actor: AuthenticatedUser = { id: 'member', username: 'member', name: '合成成员', email: null,
  departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true,
  authSource: 'local', roleCodes: [] };
const missingProject = '当前颜色尚未关联开发项目。';
const missingApproval = '当前标准尚未查询到有效量产批准记录。';

async function detail({ linked = true, approved = true, projectId = null, baseMissing = false, pending = false, oldApproved = false }:
  { linked?: boolean; approved?: boolean; projectId?: string | null; baseMissing?: boolean; pending?: boolean; oldApproved?: boolean } = {}) {
  const color = { id: 'color-a', name: '合成颜色', code: null, projectId, productionBaseId: baseMissing ? null : 'base-a',
    productionBase: baseMissing ? null : { id: 'base-a', name: '合成基地' }, manufacturer: null, paintType: null,
    registerStatus: pending ? 'PENDING_REVIEW' : 'LISTED', registerMonth: null, registerNote: null, registerRevision: 4,
    hueStandard: null, linkedProjects: linked ? [{ id: 'project-a', name: '合成项目' }] : [],
    versions: [{ id: 'current-v4', boardCode: '00017', sourceReference: null, reviewRecords: approved ? [{ id: 'review-current' }] : [] }] };
  const prisma = {
    color: { findUnique: vi.fn().mockResolvedValue(color) },
    colorVersion: { findMany: vi.fn().mockResolvedValue(oldApproved ? [{ id: 'old-v3', versionNo: 3, boardCode: '00016',
      technicalData: null, sourceReference: null, changeSummary: null, createdAt: new Date('2026-10-20T00:00:00Z'),
      reviewRecords: [{ id: 'review-old' }] }] : []), count: vi.fn().mockResolvedValue(oldApproved ? 1 : 0) },
    colorImportRow: { findMany: vi.fn().mockResolvedValue([]) }, colorProductionFact: { findMany: vi.fn().mockResolvedValue([]) },
    productionPlan: { count: vi.fn().mockResolvedValue(0) }, $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return new ColorRegisterService(prisma as unknown as PrismaService).detail('color-a', {}, actor);
}

// Read projection tests only; real review/task eligibility and relational
// integrity remain covered by the existing PostgreSQL acceptance evidence.
describe('color detail current association and approval notices', () => {
  it('does not infer a missing workflow from the legacy project field when the current project is linked and approved', async () => {
    const result = await detail();
    expect(result.projects).toEqual([{ id: 'project-a', name: '合成项目' }]);
    expect(result.productionApprovalStatus).toBe('APPROVED');
    expect(result.pendingReasons).toEqual([]);
  });
  it('keeps missing approval separate from an existing project association', async () => {
    const result = await detail({ approved: false });
    expect(result.productionApprovalStatus).not.toBe('APPROVED');
    expect(result.pendingReasons).toEqual([missingApproval]);
  });
  it('reports current missing facts while preserving base and source warnings', async () => {
    const result = await detail({ linked: false, approved: false, baseMissing: true, pending: true });
    expect(result.pendingReasons).toEqual(['生产基地尚待核对。', '来源字段存在待核对项，原始记录已保留。', missingProject, missingApproval]);
  });
  it('recognizes a legacy project relation without treating it as approval', async () => {
    const result = await detail({ linked: false, approved: false, projectId: 'legacy-project' });
    expect(result.productionApprovalStatus).toBe('NOT_APPROVED');
    expect(result.pendingReasons).toEqual([missingApproval]);
  });
  it('does not use an approved historical version to approve the current standard', async () => {
    const result = await detail({ approved: false, oldApproved: true });
    expect(result.currentStandardVersionId).toBe('current-v4');
    expect(result.versions[0]?.id).toBe('old-v3');
    expect(result.productionApprovalStatus).not.toBe('APPROVED');
    expect(result.pendingReasons).toEqual([missingApproval]);
  });
});
