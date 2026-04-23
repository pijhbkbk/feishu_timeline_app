import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const normalizedArgs =
    passthroughArgs[0] === '--' ? passthroughArgs.slice(1) : passthroughArgs;

  log('启动本地基础设施。');
  await runPnpm('infra', ['infra:up']);

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

  log('执行种子数据，确保浏览器回归有稳定演示数据。');
  await runPnpm('seed', ['prisma:seed']);

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
