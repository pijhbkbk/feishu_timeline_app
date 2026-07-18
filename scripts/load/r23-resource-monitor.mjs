import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const durationMs = parseDuration(args.duration ?? '10m');
const idleMs = parseDuration(args['idle-duration'] ?? '5m');
const sampleMs = parseDuration(args['sample-every'] ?? '10m');
const outputPath = path.resolve(args.output ?? 'test-results/r23c/monitor.json');
const prefix = args['container-prefix'] ?? 'feishu-timeline-staging';
const testRunId = validateTestRunId(args['test-run-id'] ?? 'R23C-UNKNOWN');
const projectId = validateProjectId(args['project-id'] ?? 'cmrli3mo0002en401r82nwyh0');
const startedAt = new Date();
const loadDeadline = Date.now() + durationMs;
const samples = [];

samples.push(captureSample(prefix, testRunId, 'baseline'));
while (Date.now() < loadDeadline) {
  await wait(Math.min(sampleMs, loadDeadline - Date.now()));
  samples.push(captureSample(prefix, testRunId, 'load'));
}

const loadEndedAt = new Date();
await wait(idleMs);
samples.push(captureSample(prefix, testRunId, 'idle-recovery'));
const endedAt = new Date();
const logs = captureLogs(prefix, startedAt);
const baseline = samples[0];
const recovered = samples.at(-1);
const result = {
  testRunId,
  startedAt: startedAt.toISOString(),
  loadEndedAt: loadEndedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  durationMs,
  idleRecoveryMs: idleMs,
  sampleEveryMs: sampleMs,
  metrics: {
    apiWebMemoryGrowthAfterRecovery: memoryGrowth(baseline, recovered),
    maxDbConnections: max(samples.map((sample) => sample.database?.connections)),
    maxSlowQueries: max(samples.map((sample) => sample.database?.slowQueries)),
    deadlocksBefore: baseline.database?.deadlocks ?? null,
    deadlocksAfter: recovered.database?.deadlocks ?? null,
    maxRedisMemoryBytes: max(samples.map((sample) => sample.redis?.usedMemoryBytes)),
    maxQueueDepth: max(samples.map((sample) => sample.redis?.queueDepth)),
    maxCpuPercentByContainer: Object.fromEntries(
      [...new Set(samples.flatMap((sample) => sample.containers.map((item) => item.name)))].map(
        (name) => [
          name,
          max(
            samples.flatMap((sample) =>
              sample.containers.filter((item) => item.name === name).map((item) => item.cpuPercent),
            ),
          ),
        ],
      ),
    ),
    peakMemoryBytesByContainer: Object.fromEntries(
      [...new Set(samples.flatMap((sample) => sample.containers.map((item) => item.name)))].map(
        (name) => [
          name,
          max(
            samples.flatMap((sample) =>
              sample.containers.filter((item) => item.name === name).map((item) => item.memoryBytes),
            ),
          ),
        ],
      ),
    ),
    restartsBefore: baseline.restarts,
    restartsAfter: recovered.restarts,
    runtimeLogs: logs.metrics,
    integrityBefore: baseline.integrity,
    integrityAfter: recovered.integrity,
  },
  samples,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await writeFile(path.join(path.dirname(outputPath), 'runtime-containers.log'), logs.text, 'utf8');
console.log(JSON.stringify({ outputPath, metrics: result.metrics }, null, 2));

function captureSample(containerPrefix, runId, phase) {
  const at = new Date().toISOString();
  const names = ['api', 'web', 'nginx', 'postgres', 'redis'].map(
    (service) => `${containerPrefix}-${service}`,
  );
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
        }];
      } catch {
        return [];
      }
    });
  const restarts = Object.fromEntries(
    run('docker', ['inspect', '--format', '{{.Name}}={{.RestartCount}}', ...names]).stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, count] = line.replace(/^\//, '').split('=');
        return [name, Number(count)];
      }),
  );
  const databaseValues = postgres(containerPrefix, `
    SELECT
      (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()),
      (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state <> 'idle' AND now()-query_start > interval '1 second'),
      (SELECT deadlocks FROM pg_stat_database WHERE datname=current_database());
  `).split('|').map(Number);
  const redisValues = redis(containerPrefix, 'INFO memory\nLLEN notifications:jobs');
  const integrityValues = postgres(containerPrefix, `
    SELECT
      (SELECT count(*) FROM (
        SELECT "workflowInstanceId", "nodeCode", "taskRound"
        FROM workflow_tasks WHERE "isActive" = true
        GROUP BY "workflowInstanceId", "nodeCode", "taskRound" HAVING count(*) > 1
      ) duplicates),
      (SELECT count(*) FROM recurring_tasks WHERE "projectId"='${projectId}'),
      (SELECT count(*) FROM task_progress_updates WHERE "completedContent" LIKE '%${runId}%'),
      (SELECT count(*) FROM audit_logs WHERE action='WORKFLOW_FORM_SAVED' AND COALESCE("afterData"::text,'') LIKE '%${runId}%');
  `).split('|').map(Number);

  return {
    at,
    phase,
    containers,
    restarts,
    database: Number.isFinite(databaseValues[0])
      ? { connections: databaseValues[0], slowQueries: databaseValues[1], deadlocks: databaseValues[2] }
      : null,
    redis: redisValues,
    integrity: Number.isFinite(integrityValues[0])
      ? {
          duplicateActiveWorkflowGroups: integrityValues[0],
          monthlyInstances: integrityValues[1],
          runProgressRows: integrityValues[2],
          runDraftAuditRows: integrityValues[3],
        }
      : null,
  };
}

function postgres(containerPrefix, sql) {
  return run('docker', [
    'exec',
    `${containerPrefix}-postgres`,
    'sh',
    '-lc',
    `psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c ${shellQuote(sql)}`,
  ]).stdout.trim();
}

function redis(containerPrefix, commands) {
  const output = run('docker', [
    'exec',
    `${containerPrefix}-redis`,
    'sh',
    '-lc',
    `printf '%s\\n' ${shellQuote(commands)} | redis-cli --raw --no-auth-warning -a "$REDIS_PASSWORD"`,
  ]).stdout;
  const memory = /used_memory:(\d+)/.exec(output)?.[1];
  const numericLines = output.split('\n').map((line) => line.trim()).filter((line) => /^\d+$/.test(line));
  return {
    usedMemoryBytes: memory ? Number(memory) : null,
    queueDepth: numericLines.length ? Number(numericLines.at(-1)) : null,
  };
}

function captureLogs(containerPrefix, since) {
  const sections = [];
  for (const service of ['api', 'web', 'nginx']) {
    const name = `${containerPrefix}-${service}`;
    const output = run('docker', ['logs', '--since', since.toISOString(), name]);
    sections.push(`===== ${name} =====\n${output.stdout}${output.stderr}`);
  }
  const text = `${sections.join('\n')}\n`;
  return {
    text,
    metrics: {
      uncaughtExceptions: count(text, /uncaught exception|uncaughtexception/gi),
      unhandledRejections: count(text, /unhandled rejection|unhandledrejection/gi),
      nginx5xx: count(text, /"\s5\d\d\s/gi),
      api5xx: count(text, /\b5\d\d\b.*(?:error|exception)|(?:error|exception).*\b5\d\d\b/gi),
      deadlockMessages: count(text, /deadlock detected/gi),
    },
  };
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: 30_000 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`参数格式错误：${key ?? ''}`);
    result[key.slice(2)] = value;
  }
  return result;
}

function parseDuration(value) {
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) throw new Error(`无效持续时间：${value}`);
  return Number(match[1]) * ({ s: 1000, m: 60_000, h: 3_600_000 }[match[2]]);
}

function validateTestRunId(value) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new Error('testRunId 格式不安全。');
  return value;
}

function validateProjectId(value) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new Error('projectId 格式不安全。');
  return value;
}

function memoryGrowth(before, after) {
  const sum = (sample) => sample.containers
    .filter((item) => /-(api|web)$/.test(item.name))
    .reduce((total, item) => total + item.memoryBytes, 0);
  const baseline = sum(before);
  return baseline ? Number(((sum(after) - baseline) / baseline).toFixed(6)) : null;
}

function parseHumanBytes(value) {
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(value);
  if (!match) return 0;
  const units = { B: 1, KB: 1e3, KIB: 1024, MB: 1e6, MIB: 1024 ** 2, GB: 1e9, GIB: 1024 ** 3 };
  return Number(match[1]) * (units[match[2].toUpperCase()] ?? 1);
}

function max(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function count(value, expression) {
  return Array.from(value.matchAll(expression)).length;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
