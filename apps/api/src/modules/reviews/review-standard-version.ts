import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, StandardBoardStatus, WorkflowNodeCode } from '@prisma/client';
import { ancestorEvidenceIds } from '../../common/workflow-evidence';

export const REVIEW_STANDARD_SELECT = {
  id: true, colorId: true, versionNo: true, boardCode: true,
} satisfies Prisma.ColorVersionSelect;
const STANDARD_OPTION_LIMIT = 100;
type LinkedProject = { id: string; primaryColorId?: string | null };
type ReviewTask = { projectId: string; workflowInstanceId: string; payload: Prisma.JsonValue | null };

export function parseReviewStandardVersionId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new BadRequestException('标准版本标识无效。');
  }
  return value;
}

async function eligibleWhere(db: Prisma.TransactionClient, project: LinkedProject, task: ReviewTask) {
  const boardIds = await ancestorEvidenceIds(db, task, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION);
  return {
    colorId: project.primaryColorId!,
    standardBoards: { some: {
      id: { in: boardIds }, projectId: project.id, colorId: project.primaryColorId!,
      status: StandardBoardStatus.ISSUED,
    } },
  } satisfies Prisma.ColorVersionWhereInput;
}

export async function loadReviewStandardOptions(db: Prisma.TransactionClient, project: LinkedProject, task: ReviewTask | null) {
  if (!project.primaryColorId || !task) return {
    standardVersionRequired: Boolean(project.primaryColorId), eligibleStandardVersions: [], standardVersionsHasMore: false,
  };
  const rows = await db.colorVersion.findMany({
    where: await eligibleWhere(db, project, task), select: REVIEW_STANDARD_SELECT,
    orderBy: [{ versionNo: 'desc' }, { id: 'asc' }], take: STANDARD_OPTION_LIMIT + 1,
  });
  return {
    standardVersionRequired: true,
    eligibleStandardVersions: rows.slice(0, STANDARD_OPTION_LIMIT),
    standardVersionsHasMore: rows.length > STANDARD_OPTION_LIMIT,
  };
}

/** Called inside the existing project/task-locked review creation transaction. */
export async function requireReviewStandardVersion(db: Prisma.TransactionClient, project: LinkedProject, task: ReviewTask, standardVersionId: string | null) {
  if (!project.primaryColorId) {
    if (standardVersionId) throw new BadRequestException('请先核对并关联项目的准确颜色与基地记录。');
    return null;
  }
  if (!standardVersionId) throw new BadRequestException('请选择本轮已下发标准板对应的标准版本。');
  const version = await db.colorVersion.findFirst({
    where: { id: standardVersionId, ...await eligibleWhere(db, project, task) },
    select: { id: true },
  });
  if (!version) throw new ConflictException('所选标准版本不属于项目的准确颜色，或不是本轮已下发标准板的版本。请刷新后核对。');
  return version.id;
}

/** Draft text may change; the originally reviewed standard (including legacy null) never does. */
export function assertReviewStandardUnchanged(persisted: string | null | undefined, requested: string | null) {
  if ((persisted ?? null) !== requested) {
    throw new ConflictException('评审记录已固定标准版本，不能替换或补写历史标准。请保留原记录。');
  }
}
