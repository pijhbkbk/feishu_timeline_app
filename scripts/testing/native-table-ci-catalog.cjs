const { readFile, writeFile } = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('../../apps/api/node_modules/@prisma/client');

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (process.env.CI !== 'true' || process.env.PLAYWRIGHT_NATIVE_TABLE !== '1' || !process.env.NATIVE_TABLE_CI_STATE
    || url.hostname !== 'localhost' || url.port !== '5432' || url.pathname !== '/feishu_timeline') throw Error('CI_TARGET_REQUIRED');
  const state = JSON.parse(await readFile(process.env.NATIVE_TABLE_CI_STATE, 'utf8'));
  const db = new PrismaClient();
  try {
    if (await db.user.count() !== 1 || await db.color.count() !== 0 || await db.productionBase.count() !== 0
      || !await db.user.findFirst({ where: { username: state.admin.username, isSystemAdmin: true } })) throw Error('CI_PRISTINE_TARGET_REQUIRED');
    const base = await db.productionBase.create({ data: { code: 'SYN-CI-TABLE', name: '合成CI基地' } });
    const colors = [];
    for (let i = 1; i <= 3; i++) colors.push(await db.color.create({ data: { name: `合成CI颜色${i}`, productionBaseId: base.id, registerStatus: 'LISTED', registerMonth: '2026-09' }, select: { id: true, name: true } }));
    const members = [1, 2].map(i => ({ username: `native_table_ci_${i}`, name: `合成CI维护${i}`, password: randomBytes(24).toString('hex') }));
    await writeFile(process.env.NATIVE_TABLE_CI_STATE, JSON.stringify({ ...state, baseId: base.id, colors, members }), { mode: 0o600 });
    console.log('Synthetic native CI catalog ready; no enterprise source imported.');
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error('NATIVE_CI_CATALOG_FAILED'); process.exitCode = 1; });
