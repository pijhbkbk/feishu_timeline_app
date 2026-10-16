import { PrismaClient } from '@prisma/client';
import { initializeCatalog } from '../modules/catalog/initialize-catalog';

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== 'initialize' || !process.env.DATABASE_URL) {
    throw new Error('Usage: native-catalog initialize with an explicit DATABASE_URL.');
  }
  // No .env defaults, web server, Redis, external identity or demo seed is loaded.
  const prisma = new PrismaClient();
  try {
    const result = await initializeCatalog(prisma);
    process.stdout.write(JSON.stringify({ success: true, ...result }) + '\n');
  } finally { await prisma.$disconnect(); }
}

void main().catch(() => {
  // Never expose a database URL or raw database error.
  process.stderr.write('基础目录初始化失败：仅支持已完成迁移且未初始化账号或业务的新数据库；禁止在恢复库或现有库重跑。请检查受保护配置和安装顺序。\n');
  process.exitCode = 1;
});
