import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const options = parseArgs(process.argv.slice(2));
const baseUrl = options['base-url'] ?? 'http://localhost:8080';
const virtualUsers = parsePositiveInteger(options.vus ?? '5', 'vus');
const durationMs = parseDuration(options.duration ?? '30s');
const thinkTimeMs = parsePositiveInteger(options['think-ms'] ?? '1000', 'think-ms');
const sampleIntervalMs = parsePositiveInteger(options['sample-ms'] ?? '30000', 'sample-ms');
const profile = options.profile ?? `${virtualUsers}vu-${Math.round(durationMs / 1000)}s`;
const containerPrefix = options['container-prefix'] ?? 'feishu-timeline-staging';
const sessionCookie = process.env.R23_STAGING_SESSION_COOKIE?.trim() || null;
const startedAt = new Date();
const deadline = Date.now() + durationMs;
const latencies = [];
const categoryLatencies = new Map();
const statusCounts = new Map();
const errors = [];
const resourceSamples = [];

const publicTargets = [
  { path: '/api/health', expected: [200], category: 'query-api' },
  { path: '/login', expected: [200], category: 'web-page' },
  { path: '/projects', expected: [200], category: 'web-page' },
  { path: '/api/auth/me', expected: sessionCookie ? [200] : [401], category: 'auth-api' },
];
const authenticatedTargets = sessionCookie
  ? [
      { path: '/api/projects?page=1&pageSize=20', expected: [200], category: 'query-api' },
      { path: '/api/tasks?page=1&pageSize=20', expected: [200], category: 'query-api' },
      { path: '/api/dashboard/overview', expected: [200], category: 'query-api' },
    ]
  : [];
const targets = [...publicTargets, ...authenticatedTargets];

const baseline = captureResources(containerPrefix);
resourceSamples.push({ at: startedAt.toISOString(), ...baseline });

const sampler = setInterval(() => {
  resourceSamples.push({ at: new Date().toISOString(), ...captureResources(containerPrefix) });
}, sampleIntervalMs);
sampler.unref();

await Promise.all(Array.from({ length: virtualUsers }, (_, index) => runVirtualUser(index)));
clearInterval(sampler);

const endedAt = new Date();
const finalResources = captureResources(containerPrefix);
resourceSamples.push({ at: endedAt.toISOString(), ...finalResources });
const logs = captureRuntimeLogs(containerPrefix, startedAt);
const totalRequests = latencies.length + errors.length;
const unexpectedStatuses = Array.from(statusCounts.entries())
  .filter(([key]) => key.startsWith('unexpected:'))
  .reduce((total, [, count]) => total + count, 0);
const serverErrors = Array.from(statusCounts.entries())
  .filter(([key]) => /^status:5\d\d$/.test(key))
  .reduce((total, [, count]) => total + count, 0);

const result = {
  profile,
  target: baseUrl,
  authentication: sessionCookie ? 'real-session-cookie-from-environment' : 'public-and-auth-boundary-only',
  virtualUsers,
  configuredDurationMs: durationMs,
  actualDurationMs: endedAt.getTime() - startedAt.getTime(),
  thinkTimeMs,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  requestMetrics: {
    total: totalRequests,
    successfulTransport: latencies.length,
    transportErrors: errors.length,
    unexpectedStatuses,
    errorRate: ratio(errors.length + unexpectedStatuses, totalRequests),
    serverErrors,
    serverErrorRate: ratio(serverErrors, totalRequests),
    requestsPerSecond: totalRequests / ((endedAt.getTime() - startedAt.getTime()) / 1000),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Math.max(...latencies) : null,
    },
    latencyByCategoryMs: Object.fromEntries(
      Array.from(categoryLatencies.entries()).map(([category, values]) => [category, {
        count: values.length,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
      }]),
    ),
    statusCounts: Object.fromEntries(Array.from(statusCounts.entries()).sort()),
  },
  resourceMetrics: {
    baseline,
    final: finalResources,
    apiWebMemoryGrowthRate: calculateMemoryGrowth(baseline, finalResources),
    maxDbConnections: maximum(resourceSamples.map((sample) => sample.database?.connections)),
    maxSlowQueries: maximum(resourceSamples.map((sample) => sample.database?.slowQueries)),
    maxRedisMemoryBytes: maximum(resourceSamples.map((sample) => sample.redis?.usedMemoryBytes)),
    maxCpuPercentByContainer: Object.fromEntries(
      Array.from(new Set(resourceSamples.flatMap((sample) => sample.containers.map((item) => item.name))))
        .map((name) => [name, maximum(resourceSamples.flatMap((sample) =>
          sample.containers.filter((item) => item.name === name).map((item) => item.cpuPercent),
        ))]),
    ),
    deadlocksBefore: baseline.database?.deadlocks ?? null,
    deadlocksAfter: finalResources.database?.deadlocks ?? null,
    containerRestartsBefore: baseline.restarts,
    containerRestartsAfter: finalResources.restarts,
  },
  runtimeLogMetrics: logs.metrics,
  samples: resourceSamples,
  errors: errors.slice(0, 100),
};

const outputPath = path.resolve(
  options.output ?? `test-results/r23/performance/${profile}-${fileTimestamp(startedAt)}.json`,
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await mkdir(path.resolve('test-results/r23/logs'), { recursive: true });
await writeFile(
  path.resolve(`test-results/r23/logs/${profile}-${fileTimestamp(startedAt)}-containers.log`),
  logs.text,
  'utf8',
);

console.log(JSON.stringify({ outputPath, ...result.requestMetrics, resourceMetrics: result.resourceMetrics }, null, 2));
if (result.requestMetrics.errorRate >= 0.01 || result.requestMetrics.serverErrorRate >= 0.01) {
  process.exitCode = 1;
}

async function runVirtualUser(userIndex) {
  let targetIndex = userIndex;
  while (Date.now() < deadline) {
    const target = targets[targetIndex % targets.length];
    targetIndex += 1;
    const requestStarted = performance.now();
    try {
      const response = await fetch(new URL(target.path, baseUrl), {
        headers: sessionCookie ? { cookie: sessionCookie } : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      const elapsed = performance.now() - requestStarted;
      latencies.push(elapsed);
      const categoryValues = categoryLatencies.get(target.category) ?? [];
      categoryValues.push(elapsed);
      categoryLatencies.set(target.category, categoryValues);
      increment(`status:${response.status}`);
      increment(`category:${target.category}`);
      if (!target.expected.includes(response.status)) {
        increment(`unexpected:${response.status}`);
      }
      await response.body?.cancel();
    } catch (error) {
      errors.push({
        at: new Date().toISOString(),
        userIndex,
        path: target.path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    await wait(thinkTimeMs);
  }
}

function captureResources(prefix) {
  const names = ['api', 'web', 'nginx', 'postgres', 'redis'].map((service) => `${prefix}-${service}`);
  const stats = run('docker', ['stats', '--no-stream', '--format', '{{json .}}', ...names]);
  const containers = stats.stdout
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return [{
          name: value.Name,
          cpuPercent: Number.parseFloat(value.CPUPerc) || 0,
          memoryBytes: parseHumanBytes(String(value.MemUsage).split('/')[0]?.trim() ?? ''),
          memoryUsage: value.MemUsage,
        }];
      } catch {
        return [];
      }
    });
  const restartOutput = run('docker', [
    'inspect',
    '--format',
    '{{.Name}}={{.RestartCount}}',
    ...names,
  ]).stdout;
  const restarts = Object.fromEntries(
    restartOutput.split('\n').filter(Boolean).map((line) => {
      const [name, count] = line.replace(/^\//, '').split('=');
      return [name, Number(count)];
    }),
  );
  const databaseOutput = run('docker', [
    'exec',
    `${prefix}-postgres`,
    'sh',
    '-lc',
    'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()), (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state <> \'idle\' AND now()-query_start > interval \'1 second\'), (SELECT deadlocks FROM pg_stat_database WHERE datname=current_database());"',
  ]).stdout.trim();
  const [connections, slowQueries, deadlocks] = databaseOutput.split('|').map(Number);
  const redisOutput = run('docker', [
    'exec',
    `${prefix}-redis`,
    'sh',
    '-lc',
    'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" INFO memory | sed -n "s/^used_memory:\\([0-9]*\\).*/\\1/p"',
  ]).stdout.trim();

  return {
    containers,
    restarts,
    database: Number.isFinite(connections)
      ? { connections, slowQueries, deadlocks }
      : null,
    redis: /^\d+$/.test(redisOutput) ? { usedMemoryBytes: Number(redisOutput) } : null,
  };
}

function captureRuntimeLogs(prefix, since) {
  const sections = [];
  for (const service of ['api', 'web', 'nginx']) {
    const name = `${prefix}-${service}`;
    const output = run('docker', ['logs', '--since', since.toISOString(), name]);
    sections.push(`===== ${name} =====\n${output.stdout}${output.stderr}`);
  }
  const text = `${sections.join('\n')}\n`;
  return {
    text,
    metrics: {
      uncaughtExceptions: countMatches(text, /uncaught exception|uncaughtexception/gi),
      unhandledRejections: countMatches(text, /unhandled rejection|unhandledrejection/gi),
      nginx5xx: countMatches(text, /"\s5\d\d\s/gi),
      databaseDeadlockMessages: countMatches(text, /deadlock detected/gi),
    },
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 20_000 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === '--') continue;
    if (!key?.startsWith('--')) throw new Error(`Unknown argument: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function parseDuration(value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return amount * multipliers[match[2]];
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)].toFixed(2));
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(6)) : 0;
}

function maximum(values) {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
}

function calculateMemoryGrowth(before, after) {
  const relevant = (snapshot) => snapshot.containers
    .filter((container) => /-(api|web)$/.test(container.name))
    .reduce((sum, container) => sum + container.memoryBytes, 0);
  const initial = relevant(before);
  const final = relevant(after);
  return initial ? Number(((final - initial) / initial).toFixed(6)) : null;
}

function parseHumanBytes(value) {
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(value);
  if (!match) return 0;
  const units = { B: 1, KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2, GB: 1e9, GIB: 1024 ** 3, TB: 1e12, TIB: 1024 ** 4 };
  return Number(match[1]) * (units[match[2].toUpperCase()] ?? 1);
}

function increment(key) {
  statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
}

function countMatches(value, expression) {
  return Array.from(value.matchAll(expression)).length;
}

function fileTimestamp(value) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
