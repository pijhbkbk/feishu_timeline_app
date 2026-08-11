import { Prisma, type WorkflowNodeCode } from '@prisma/client';

const WORKFLOW_ASSIGNMENT_LOCK_NAMESPACE =
  'feishu-timeline:workflow-assignment-mutation:v1';

export async function lockWorkflowAssignmentMutations(
  tx: Prisma.TransactionClient,
  projectId: string,
  nodeCodes: WorkflowNodeCode[],
) {
  return lockWorkflowAssignmentTargets(
    tx,
    nodeCodes.map((nodeCode) => ({ projectId, nodeCode })),
  );
}

export async function lockWorkflowAssignmentTargets(
  tx: Prisma.TransactionClient,
  targets: Array<{
    projectId: string;
    nodeCode: WorkflowNodeCode;
  }>,
) {
  const stableTargets = [
    ...new Map(
      targets.map((target) => [
        `${target.projectId}\u0000${target.nodeCode}`,
        target,
      ]),
    ).values(),
  ].sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.nodeCode.localeCompare(right.nodeCode),
  );

  for (const target of stableTargets) {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext(${WORKFLOW_ASSIGNMENT_LOCK_NAMESPACE}),
          hashtext(${`${target.projectId}:${target.nodeCode}`})
        ) AS "locked"
      `,
    );
  }
}
