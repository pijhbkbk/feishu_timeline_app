import { PrismaClient, Prisma } from '@prisma/client';
import { lockTeamAuthorization } from '../common/team-authorization';
import { BUSINESS_ROLE_CODES } from '../modules/personnel/personnel.constants';
import { reconcileTeamAssignments } from '../modules/personnel/team-assignment';

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== 'reconcile' || !process.env.DATABASE_URL) {
    throw new Error('Usage: team-roles reconcile with an explicit DATABASE_URL.');
  }
  // Invoked by the controlled release after backup/migrate, before writers resume.
  // Never imports production data, grants roles, merges accounts, or starts workers.
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async tx => {
      await lockTeamAuthorization(tx, true);
      return reconcileTeamAssignments(tx, { actorUserId: null, roleCodes: BUSINESS_ROLE_CODES,
        reason: 'R28 受控版本迁移：未完任务改用已存在的有效团队角色；保留历史署名' });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 60000 });
    process.stdout.write(JSON.stringify({ success: true, ...result }) + '\n');
  } finally { await prisma.$disconnect(); }
}

void main().catch(() => {
  process.stderr.write('团队角色交接未完成；事务已回滚。请保留维护状态，检查角色目录、任务数量及隔离演练记录。\n');
  process.exitCode = 1;
});
