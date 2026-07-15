import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const session = JSON.parse(open(__ENV.K6_SESSION_FILE));
const baseUrl = __ENV.K6_BASE_URL || session.baseUrl || 'http://host.docker.internal:8080';
const browserOrigin = __ENV.K6_BROWSER_ORIGIN || 'http://localhost:8080';
const projectId = __ENV.K6_PROJECT_ID || 'cmrli3pqi002vn401zld6zcfy';
const testRunId = __ENV.K6_TEST_RUN_ID || `R23C-${Date.now()}`;

export const readLatency = new Trend('r23c_read_latency', true);
export const writeLatency = new Trend('r23c_write_latency', true);
export const unexpectedAuth = new Counter('r23c_unexpected_auth');
export const serverErrors = new Counter('r23c_server_errors');
export const functionalFailures = new Counter('r23c_functional_failures');
export const readRequests = new Counter('r23c_read_requests');
export const draftWrites = new Counter('r23c_draft_writes');
export const progressWrites = new Counter('r23c_progress_writes');

const primaryReads = [
  '/api/auth/session',
  '/api/dashboard/overview',
  '/api/projects?page=1&pageSize=20',
  `/api/projects/${projectId}`,
  `/api/projects/${projectId}/flow-map`,
  `/api/workflows/projects/${projectId}`,
];

const secondaryReads = [
  '/api/tasks/my?page=1&pageSize=20',
  `/api/projects/${projectId}/attachments?page=1&pageSize=20`,
  `/api/projects/${projectId}/logs?page=1&pageSize=20`,
];

export function buildOptions({ vus, duration }) {
  return {
    vus,
    duration,
    discardResponseBodies: false,
    thresholds: {
      http_req_failed: ['rate<0.01'],
      r23c_read_latency: ['p(95)<800'],
      r23c_write_latency: ['p(95)<1500'],
      r23c_unexpected_auth: ['count==0'],
      r23c_server_errors: ['count==0'],
      r23c_functional_failures: ['count==0'],
    },
  };
}

export function setupAuthenticatedScenario() {
  assertSessionFileFresh();
  const sessionResponse = request('GET', '/api/auth/session', null, 'read', [200]);
  const sessionPayload = safeJson(sessionResponse);
  if (!sessionPayload?.authenticated) {
    throw new Error('真实 staging Session 无效。');
  }

  const workflowResponse = request(
    'GET',
    `/api/workflows/projects/${projectId}`,
    null,
    'read',
    [200],
  );
  const workflow = safeJson(workflowResponse);
  const task = workflow?.activeTasks?.find(
    (item) => item?.isActive && ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'].includes(item.status),
  );
  if (!task?.id) {
    throw new Error('并发测试项目没有可写入的活跃任务。');
  }

  return { taskId: task.id, projectId };
}

export function runProfileIteration(data, profile) {
  if (profile === '5vu-2h') {
    if (__VU === 1) {
      const action = Math.random();
      if (action < 0.5) {
        saveDraft(data.taskId);
        sleep(1);
        return;
      }
      if (action < 0.75) {
        submitProgress(data.taskId);
        sleep(1);
        return;
      }
    }
    readOne(Math.random() < 0.8235 ? primaryReads : secondaryReads);
    sleep(1);
    return;
  }

  if (__VU === 1) {
    Math.random() < 0.5 ? saveDraft(data.taskId) : submitProgress(data.taskId);
  } else {
    readOne(Math.random() < 0.8 ? primaryReads : secondaryReads);
  }
  sleep(1);
}

export function runPreflightIteration(data) {
  for (const target of [...primaryReads, ...secondaryReads]) {
    const response = request('GET', target, null, 'read', [200]);
    if (target === '/api/auth/session') {
      const payload = safeJson(response);
      if (!payload?.authenticated) functionalFailures.add(1);
    }
  }

  if (__ITER === 0) {
    saveDraft(data.taskId);
    const requestId = nextRequestId();
    const idempotencyKey = `idem-${requestId}`.slice(0, 120);
    const first = submitProgress(data.taskId, { requestId, idempotencyKey });
    const second = submitProgress(data.taskId, { requestId, idempotencyKey });
    if (!safeJson(first)?.id || safeJson(first)?.id !== safeJson(second)?.id) {
      functionalFailures.add(1);
    }
  }

  sleep(5);
}

export function buildSummary(data) {
  const summaryPath = __ENV.K6_SUMMARY_PATH || '/results/summary.json';
  const compact = {
    testRunId,
    sessionMode: 'single-real-feishu-oauth-session',
    multiRoleClaimed: false,
    metrics: data.metrics,
    rootGroup: data.root_group,
  };
  const stdout = {
    testRunId,
    checks: data.metrics.checks?.values ?? null,
    httpReqFailed: data.metrics.http_req_failed?.values ?? null,
    httpReqDuration: data.metrics.http_req_duration?.values ?? null,
    readLatency: data.metrics.r23c_read_latency?.values ?? null,
    writeLatency: data.metrics.r23c_write_latency?.values ?? null,
    unexpectedAuth: data.metrics.r23c_unexpected_auth?.values ?? null,
    serverErrors: data.metrics.r23c_server_errors?.values ?? null,
  };
  return {
    [summaryPath]: `${JSON.stringify(compact, null, 2)}\n`,
    stdout: `${JSON.stringify(stdout, null, 2)}\n`,
  };
}

function readOne(targets) {
  const target = targets[Math.floor(Math.random() * targets.length)];
  request('GET', target, null, 'read', [200]);
  readRequests.add(1);
}

function saveDraft(taskId) {
  const requestId = nextRequestId();
  const idempotencyKey = `idem-${requestId}`.slice(0, 120);
  const response = request(
    'PUT',
    `/api/workflows/tasks/${taskId}/form`,
    {
      payload: { testRunId, requestId, idempotencyKey, source: 'R23C_AUTH_ENDURANCE' },
      comment: `${testRunId}:${requestId}`,
    },
    'write',
    [200],
    requestId,
  );
  if (response.status === 200) draftWrites.add(1);
  return response;
}

function submitProgress(taskId, identifiers = null) {
  const requestId = identifiers?.requestId ?? nextRequestId();
  const idempotencyKey = identifiers?.idempotencyKey ?? `idem-${requestId}`.slice(0, 120);
  const response = request(
    'POST',
    `/api/tasks/${taskId}/progress`,
    {
      completedContent: `${testRunId} 受控认证耐久进展 ${requestId}`,
      nextPlan: `R23C requestId=${requestId}; idempotencyKey=${idempotencyKey}`,
      completionPercent: 50,
      isBlocked: false,
      idempotencyKey,
    },
    'write',
    [200, 201],
    requestId,
  );
  if ([200, 201].includes(response.status)) progressWrites.add(1);
  return response;
}

function request(method, pathname, body, kind, expectedStatuses, requestId = null) {
  const headers = {
    Cookie: session.cookieHeader,
    Origin: browserOrigin,
    Accept: 'application/json',
    ...(body === null ? {} : { 'Content-Type': 'application/json' }),
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  };
  const response = http.request(
    method,
    `${baseUrl}${pathname}`,
    body === null ? null : JSON.stringify(body),
    { headers, tags: { kind, r23c: 'true' }, redirects: 0, timeout: '10s' },
  );
  (kind === 'read' ? readLatency : writeLatency).add(response.timings.duration);
  if (response.status === 401 || response.status === 403) unexpectedAuth.add(1);
  if (response.status >= 500) serverErrors.add(1);
  const ok = expectedStatuses.includes(response.status);
  if (!ok) functionalFailures.add(1);
  check(response, { [`${method} ${pathname} expected status`]: () => ok });
  return response;
}

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function nextRequestId() {
  return `${testRunId}-${__VU}-${__ITER}-${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, '-');
}

function assertSessionFileFresh() {
  if (!session?.cookieHeader || !/^ft_session=[^;\s]+$/.test(session.cookieHeader)) {
    throw new Error('K6_SESSION_FILE 格式不正确。');
  }
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    throw new Error('真实 staging Session 已过期。');
  }
}
