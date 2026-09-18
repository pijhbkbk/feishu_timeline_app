import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import appConfig, { APP_ENV_FILE_PATHS } from '../common/app-config';
import { PrismaModule } from '../infra/prisma/prisma.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisModule } from '../infra/redis/redis.module';
import { AuthModule } from '../modules/auth/auth.module';
import { NativeAuthService } from '../modules/auth/native-auth.service';
import { NATIVE_PASSWORD_MIN_LENGTH } from '../modules/auth/native-auth.rules';
import { validateHostAdministratorPlan } from '../modules/auth/host-administrator-plan';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig], envFilePath: [...APP_ENV_FILE_PATHS] }), PrismaModule, RedisModule, AuthModule] })
class NativeAccountCliModule {}

async function grantPlanFromFile(path: string) {
  if (process.getuid?.() !== 0) throw new Error('管理员维护需要主机 root。');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== 0 || (stat.mode & 0o777) !== 0o600 || stat.size < 2 || stat.size > 4096) {
      throw new Error('维护计划必须为 root 持有的独立0600普通文件。');
    }
    return validateHostAdministratorPlan(JSON.parse(await file.readFile('utf8')) as unknown);
  } finally { await file.close(); }
}

async function passwordFromFile(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size < NATIVE_PASSWORD_MIN_LENGTH || stat.size > 512) {
      throw new Error('密码文件必须由当前用户持有、仅本人可读、是独立普通文件且为 8–512 字节。');
    }
    return (await file.readFile('utf8')).replace(/\r?\n$/, '');
  } finally { await file.close(); }
}

async function passwordFromTerminal() {
  if (!process.stdin.isTTY) throw new Error('请使用交互式终端或受保护的 --password-file。');
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write('输入新密码（不显示）：');
    const password = await rl.question('');
    process.stdout.write('\n再次输入密码：');
    const confirmation = await rl.question('');
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('两次密码不一致。');
    return password;
  } finally { rl.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (command === 'grant-administrator') {
    if (args.length !== 2 || args[0] !== '--grant-file' || !args[1]) throw new Error('需要受保护的 --grant-file。');
    const plan = await grantPlanFromFile(args[1]);
    const app = await NestFactory.createApplicationContext(NativeAccountCliModule, { logger: false });
    try {
      const result = await app.get(NativeAuthService).grantAdministratorFromHost(plan);
      process.stdout.write(JSON.stringify(result) + '\n');
    } finally { await app.get(PrismaService).$disconnect(); await app.close(); }
    return;
  }
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!key || !value || !['--username', '--name', '--user-id', '--password-file'].includes(key) || values.has(key)) throw new Error('命令参数无效。');
    values.set(key, value);
  }
  if (!['initialize', 'bind'].includes(command ?? '') || !values.get('--username') || (command === 'bind' && !values.get('--user-id'))) {
    throw new Error('用法：native-account initialize --username NAME --name NAME [--user-id EXISTING_ADMIN_ID] 或 bind --user-id ID --username NAME；密码从终端或 --password-file 读取。');
  }
  const password = values.has('--password-file') ? await passwordFromFile(values.get('--password-file')!) : await passwordFromTerminal();
  const app = await NestFactory.createApplicationContext(NativeAccountCliModule, { logger: false });
  try {
    const service = app.get(NativeAuthService);
    const result = command === 'initialize' ? await service.initializeAdministrator({
      username: values.get('--username')!, name: values.get('--name') || '系统管理员', password,
      ...(values.has('--user-id') ? { existingUserId: values.get('--user-id')! } : {}),
    }) : await service.bindFromHost(values.get('--user-id')!, values.get('--username')!, password);
    process.stdout.write(JSON.stringify({ success: true, ...result }) + '\n');
  } finally {
    await app.get(PrismaService).$disconnect();
    await app.close();
  }
}

void main().catch(() => {
  // Never print raw database errors or credential-bearing inputs.
  process.stderr.write('账号初始化/绑定/维护失败；请检查命令、现有账号状态及受保护配置。未输出任何凭据。\n');
  process.exitCode = 1;
});
