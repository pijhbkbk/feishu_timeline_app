import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import appConfig from '../common/app-config';
import type { PrismaService } from '../infra/prisma/prisma.service';
import { LocalFilesystemObjectStorageService } from '../infra/storage/object-storage.service';
import { ConfiguredMalwareScanner } from '../modules/attachments/malware-scanner.service';
import { importColorWorkbook } from '../modules/color-register/color-register-import';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import { assertApprovedTeamMember } from '../common/team-membership';

async function main() {
  const [file, manifestPath, actorId] = process.argv.slice(2);
  if (process.argv.length !== 5 || !file || !manifestPath || !actorId || !process.env.DATABASE_URL || !process.env.OBJECT_STORAGE_LOCAL_ROOT || process.env.MALWARE_SCANNER_PROVIDER !== 'clamav') {
    throw new Error('SOURCE_IMPORT_USAGE');
  }
  const [fileStat, manifestStat] = await Promise.all([stat(file), stat(manifestPath)]);
  if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024 || !manifestStat.isFile() || manifestStat.size > 48 * 1024 * 1024) throw new Error('SOURCE_IMPORT_SIZE');
  const buffer = await readFile(file);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, username: true, name: true, status: true,
      email: true, departmentId: true, teamAccessApproved: true, isSystemAdmin: true, authVersion: true,
      localCredential: { select: { userId: true } } } });
    if (!user || user.status !== 'ACTIVE' || !user.localCredential) throw new Error('SOURCE_IMPORT_ACTOR');
    const actor: AuthenticatedUser = { ...user, departmentName: null, authSource: 'local', roleCodes: [], permissionCodes: [] };
    assertApprovedTeamMember(actor);
    const config = new ConfigService(appConfig());
    const scanner = new ConfiguredMalwareScanner(config);
    const scan = await scanner.scan({ buffer, fileName: basename(file), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', checksum: sha256 });
    if (scan.verdict !== 'CLEAN') throw new Error('SOURCE_IMPORT_SCAN_REJECTED');
    const storage = new LocalFilesystemObjectStorageService(config);
    await storage.assertWriteCapacity({ bytes: buffer.length, minFreeBytes: 512 * 1024 * 1024 });
    const objectKey = `color-register/${sha256}.xlsx`;
    // Content-addressed bytes are retained on a failed DB import and are safe to retry; no business row is half committed.
    await storage.upload({ bucket: 'color-register-sources', storageKey: objectKey, buffer });
    const result = await importColorWorkbook(prisma as PrismaService, actor, { manifest, sha256, fileName: basename(file), byteSize: buffer.length, objectKey,
      scanEvidence: { engine: scan.engine, engineVersion: scan.engineVersion, signatureVersion: scan.signatureVersion, scannedAt: scan.scannedAt.toISOString(), verdict: scan.verdict } });
    process.stdout.write(JSON.stringify({ ...result, sha256, sourceScan: scan.verdict }) + '\n');
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => {
  const safe = error instanceof Error && /^(SOURCE_IMPORT_[A-Z_]+|CLAMAV_[A-Z_]+)$/.test(error.message) ? error.message : 'SOURCE_IMPORT_FAILED';
  process.stderr.write(`颜色清单导入未提交：${safe}。请核对私有来源、已准入操作人、解析结果及隔离数据库配置。\n`);
  process.exitCode = 1;
});
