import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { reviewStandardEvidence } from './review-standard-evidence';
import { assertReviewStandardUnchanged, loadReviewStandardOptions, parseReviewStandardVersionId, requireReviewStandardVersion } from './review-standard-version';
vi.mock('./review-standard-evidence', () => ({ reviewStandardEvidence: vi.fn(async () => ({ boardIds: ['board-this-round'], parallel: false })) }));
const project = { id: 'project-one', primaryColorId: 'color-shandong' };
const task = { projectId: project.id, workflowInstanceId: 'workflow-one', payload: { fromTaskId: 'previous-task' } };
function client() {
  const value = { colorVersion: { findMany: vi.fn(async () => [] as unknown[]), findFirst: vi.fn(async () => null as { id: string } | null) } };
  return { value, db: value as unknown as Prisma.TransactionClient };
}
describe('explicit review standard version', () => {
  it('requires an explicit version for linked colors, before any latest-version query', async () => {
    const { value, db } = client();
    await expect(requireReviewStandardVersion(db, project, task, null)).rejects.toThrow('请选择');
    expect(value.colorVersion.findFirst).not.toHaveBeenCalled();
  });
  it('preserves unlinked historical projects as null without inventing a standard', async () => {
    const { value, db } = client();
    expect(await requireReviewStandardVersion(db, { id: project.id, primaryColorId: null }, task, null)).toBeNull();
    expect(value.colorVersion.findFirst).not.toHaveBeenCalled();
    await expect(requireReviewStandardVersion(db, { id: project.id, primaryColorId: null }, task, 'version-other')).rejects.toThrow('准确颜色');
  });
  it('rejects another color/base or a board from another workflow round without fallback', async () => {
    const { value, db } = client();
    await expect(requireReviewStandardVersion(db, project, task, 'version-xingang')).rejects.toThrow('不属于');
    expect(reviewStandardEvidence).toHaveBeenCalledWith(db, task);
    expect(value.colorVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'version-xingang', colorId: 'color-shandong', standardBoards: { some: {
        id: { in: ['board-this-round'] }, projectId: project.id, colorId: 'color-shandong', status: 'ISSUED',
      } } }, select: { id: true },
    });
    expect(value.colorVersion.findMany).not.toHaveBeenCalled();
  });
  it('requires a published and actually issued standard with a resolved base for the parallel path', async () => {
    const { value, db } = client();
    vi.mocked(reviewStandardEvidence).mockResolvedValueOnce({ boardIds: ['board-this-round'], parallel: true });
    await loadReviewStandardOptions(db, project, task);
    expect(value.colorVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      colorId: project.primaryColorId, publishedAt: { not: null }, color: { productionBaseId: { not: null } },
      standardBoards: { some: { id: { in: ['board-this-round'] }, projectId: project.id,
        colorId: project.primaryColorId, status: 'ISSUED', issuedAt: { not: null } } },
    } }));
  });
  it('rejects a review task from another project before resolving any standard', async () => {
    const { db } = client();
    await expect(loadReviewStandardOptions(db, project, { ...task, projectId: 'foreign-project' })).rejects.toThrow('不属于当前项目');
  });
  it('pins the chosen eligible ID, independently of newest version', async () => {
    const { value, db } = client();
    value.colorVersion.findFirst.mockResolvedValue({ id: 'version-v1' });
    expect(await requireReviewStandardVersion(db, project, task, 'version-v1')).toBe('version-v1');
  });
  it('bounds option loading with a sentinel and exposes truncation', async () => {
    const { value, db } = client();
    value.colorVersion.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ id: `v${i}`, colorId: project.primaryColorId, versionNo: i, boardCode: null })));
    const result = await loadReviewStandardOptions(db, project, task);
    expect(result.eligibleStandardVersions).toHaveLength(100);
    expect(result.standardVersionsHasMore).toBe(true);
    expect(value.colorVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });
  it('keeps records fixed across corrections and never backfills legacy null', () => {
    expect(() => assertReviewStandardUnchanged('version-v1', 'version-v1')).not.toThrow();
    expect(() => assertReviewStandardUnchanged('version-v1', 'version-v2')).toThrow('不能替换');
    expect(() => assertReviewStandardUnchanged('version-v1', null)).toThrow('不能替换');
    expect(() => assertReviewStandardUnchanged(null, 'version-v1')).toThrow('补写历史');
    expect(() => assertReviewStandardUnchanged(null, null)).not.toThrow();
  });
  it.each([{}, [], 1, 'x'.repeat(129), 'version/other'])('rejects invalid IDs %j', value => {
    expect(() => parseReviewStandardVersionId(value)).toThrow('标识无效');
  });
});
