import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { nativeTableEnvironment } from '../../../scripts/testing/native-table-ci-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function log(message) {
  console.log(`[R13:PW] ${message}`);
}

function spawnPnpm(label, args) {
  const child = spawn('pnpm', args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.log(`[${label}] ${line}`);
    }
  });

  child.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.error(`[${label}] ${line}`);
    }
  });

  return child;
}

async function runPnpm(label, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawnPnpm(label, args);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${label} 失败，退出码 ${code ?? 'null'}`));
    });
  });
}

async function main() {
  const passthroughArgs = process.argv.slice(2);
  let normalizedArgs =
    passthroughArgs[0] === '--' ? passthroughArgs.slice(1) : passthroughArgs;
  const nativeTable = normalizedArgs.includes('--native-table');
  if (nativeTable) {
    Object.assign(process.env, nativeTableEnvironment(process.env));
    normalizedArgs = normalizedArgs.filter(value => value !== '--native-table');
  }
  if (normalizedArgs.includes('@r23')) {
    process.env.PLAYWRIGHT_RESULT_ROUND = 'r23';
  }

  log('启动本地基础设施。');
  // Compose "started" precedes PostgreSQL's first-run initialization. Migrations
  // require the existing health checks, with a bounded failure, not a blind sleep.
  await runPnpm('infra', ['infra:up', '--wait', '--wait-timeout', '120']);

  log('生成当前 schema 的 Prisma 客户端。');
  await runPnpm('generate', ['--filter', '@feishu-timeline/api', 'prisma:generate']);

  log('执行 Prisma migrate deploy。');
  await runPnpm('migrate', [
    '--filter',
    '@feishu-timeline/api',
    'exec',
    'dotenv',
    '-e',
    '.env.example',
    '--',
    'prisma',
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ]);

  if (nativeTable) {
    log('初始化空白隔离库的基础目录和原生管理员。');
    const privateRoot = await mkdtemp(resolve(tmpdir(), 'native-table-ci-'));
    const passwordFile = resolve(privateRoot, 'admin.password');
    const password = randomBytes(24).toString('hex');
    console.log(`::add-mask::${password}`);
    await writeFile(passwordFile, password, { mode: 0o600, flag: 'wx' });
    process.env.NATIVE_TABLE_CI_STATE = resolve(privateRoot, 'state.json');
    await writeFile(process.env.NATIVE_TABLE_CI_STATE, JSON.stringify({ admin: { username: 'native_table_ci_admin', password }, privateRoot }), { mode: 0o600, flag: 'wx' });
    const apiExec = ['--filter', '@feishu-timeline/api', 'exec', 'dotenv', '-e', '.env.example', '--', 'tsx'];
    await runPnpm('catalog', [...apiExec, 'src/cli/native-catalog.ts', 'initialize']);
    await runPnpm('administrator', [...apiExec, 'src/cli/native-account.ts', 'initialize', '--username', 'native_table_ci_admin', '--name', '合成CI管理员', '--password-file', passwordFile]);
    await runPnpm('synthetic-catalog', [...apiExec, '../../scripts/testing/native-table-ci-catalog.cjs']);
    const state = JSON.parse(await readFile(process.env.NATIVE_TABLE_CI_STATE, 'utf8'));
    for (const member of state.members) console.log(`::add-mask::${member.password}`);
  } else {
    log('执行历史回归的演示种子数据。');
    await runPnpm('seed', ['prisma:seed']);
  }

  log('执行 Playwright 浏览器回归。');
  await runPnpm('playwright', [
    '--filter',
    '@feishu-timeline/web',
    'exec',
    'playwright',
    'test',
    '--config',
    'playwright.config.mjs',
    ...normalizedArgs,
  ]);
}

main().catch((error) => {
  console.error(`[R13:PW] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
