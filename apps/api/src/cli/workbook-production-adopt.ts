import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
import type { PrismaService } from '../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import { adoptWorkbookProduction } from '../modules/color-register/workbook-production-adoption';

async function main() {
  const [sha256, fromMonth, toMonth, actorId, output, planHash] = process.argv.slice(2);
  if (!sha256 || !fromMonth || !toMonth || !actorId || !output || !process.env.DATABASE_URL || ![7, 8].includes(process.argv.length)) throw Error('WORKBOOK_ADOPTION_USAGE');
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { id: actorId }, select: { id: true, username: true, name: true, email: true,
      departmentId: true, isSystemAdmin: true, teamAccessApproved: true, authVersion: true, status: true, localCredential: { select: { userId: true } } } });
    if (!user || user.status !== 'ACTIVE' || !user.localCredential) throw Error('WORKBOOK_ADOPTION_ACTOR');
    const actor: AuthenticatedUser = { ...user, authSource: 'local', departmentName: null, roleCodes: [], permissionCodes: [] };
    const result = await adoptWorkbookProduction(db as PrismaService, actor, { sha256, fromMonth, toMonth, ...(planHash ? { expectedPlanHash: planHash } : {}) });
    await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({ status: result.status, ...(result.status === 'PLAN_ONLY' ? { planHash: result.planHash, conflicts: result.plan.conflicts.length } : {}) }) + '\n');
  } finally { await db.$disconnect(); }
}
void main().catch(() => { process.stderr.write('WORKBOOK_ADOPTION_FAILED: 请检查私有计划、来源身份及已有业务冲突；不覆盖已有记录。\n'); process.exitCode = 1; });
