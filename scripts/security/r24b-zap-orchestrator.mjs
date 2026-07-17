import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const sessionFile = await validateSessionFile(process.env.R24B_SESSION_FILE);
const reportDir = path.resolve(requiredEnv('R24B_REPORT_DIR'));
const runtimeDir = path.resolve(requiredEnv('R24B_RUNTIME_DIR'));
const target = new URL(process.env.R24B_TARGET_URL ?? 'https://r24b-staging.local');
const zapApi = new URL(process.env.R24B_ZAP_API_URL ?? 'http://127.0.0.1:18090');
const contextName = 'R24B';
const userName = 'r24b-session';
const sessionName = 'r24b-authenticated';
const cookieName = 'ft_session';
const forbiddenTargetPattern = /(?:open\.feishu\.cn|feishu\.cn|larksuite\.com|timeline\.all-too-well\.com)/i;

if (target.protocol !== 'https:' || target.hostname !== 'r24b-staging.local') {
  throw new Error('R24B ZAP target must be the isolated HTTPS staging alias.');
}

const sessionDocument = JSON.parse(await readFile(sessionFile, 'utf8'));
const sessionToken = extractCookieValue(sessionDocument.cookieHeader, cookieName);
const siteName = `${target.hostname}:443`;
const startedAt = new Date();
const protectedPaths = [
  '/api/auth/session',
  '/api/projects',
  '/api/users/me',
  '/api/tasks/my',
  '/api/notifications/unread-count',
  '/api/dashboard/personal-overview',
];
const activePaths = [
  '/api/auth/session',
  '/api/projects',
  '/api/users/me',
  '/api/tasks/my',
  '/api/notifications/unread-count',
  '/api/dashboard/personal-overview',
];
const safeScannerIds = [
  0, 7, 20019, 30001, 30002, 30003, 40003, 40008, 40009, 40018, 40042,
  40044, 90017, 90019, 90020, 90021, 90023, 90025, 90026, 90029, 90034,
  90035, 90036,
];

await assertUnauthenticatedBoundary();
await zapAction('core', 'accessUrl', {
  url: target.href,
  followRedirects: 'false',
});

const contextId = await configureContext();
const userId = await configureManualUser(contextId);
await configureHttpSession();
const authProof = await verifyAuthenticatedRequests();
const openApiSummary = await createGetOnlyOpenApi();
const traditionalSpider = await runTraditionalSpider(contextId, userId);
const ajaxSpider = await runAjaxSpider();
const openApiImport = await importGetOnlyOpenApi(contextId, userId);
await waitForPassiveScan();
const activeScan = await runLowRiskActiveScan(contextId, userId);
await waitForPassiveScan();
const authStats = await collectAuthenticationStats();

const scopedReportDir = path.join(runtimeDir, 'scoped-reports');
await mkdir(scopedReportDir, { mode: 0o700 });
await generateScopedReport('traditional-json', 'zap-authenticated.json');
await generateScopedReport('traditional-html', 'zap-authenticated.html');
const jsonReport = await readFile(path.join(scopedReportDir, 'zap-authenticated.json'));
const htmlReport = await readFile(path.join(scopedReportDir, 'zap-authenticated.html'));
assertReportHasNoAuthenticationMaterial(jsonReport, htmlReport);

const parsedReport = JSON.parse(jsonReport.toString('utf8'));
const targetHosts = new Set(
  (Array.isArray(parsedReport.site) ? parsedReport.site : [])
    .map((site) => String(site?.['@host'] ?? ''))
    .filter(Boolean),
);
if (targetHosts.size !== 1 || !targetHosts.has(target.hostname)) {
  throw new Error('ZAP report is not limited to exactly one isolated staging host.');
}

await writeFile(path.join(reportDir, 'zap-authenticated.json'), jsonReport, { mode: 0o600 });
await writeFile(path.join(reportDir, 'zap-authenticated.html'), htmlReport, { mode: 0o600 });

const riskCounts = countRisks(parsedReport);
const completedAt = new Date();
const summary = {
  schemaVersion: 1,
  applicationCommit: process.env.R24B_APPLICATION_COMMIT ?? 'unknown',
  target: target.origin,
  authMethod: 'real Feishu OAuth session; repository-external temporary cookie; ZAP HTTP session',
  authMaterialUsed: true,
  authMaterialStoredInReport: false,
  authenticatedProof: authProof,
  unauthenticatedProjectStatus: 401,
  authenticationStats: authStats,
  traditionalSpider,
  ajaxSpider,
  openApi: { ...openApiSummary, ...openApiImport },
  activeScan,
  excludedDomains: [
    'Feishu login and Open Platform',
    'production timeline domain',
    'third-party CDN and monitoring domains',
  ],
  riskCounts,
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
  durationSeconds: Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
};

await writeFile(
  path.join(reportDir, 'execution-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  { mode: 0o600 },
);

console.log(JSON.stringify({
  authenticatedProof: authProof.every((entry) => entry.status === 200),
  targetHostOnly: targetHosts.size === 1 && targetHosts.has(target.hostname),
  riskCounts,
  authMaterialStoredInReport: false,
}));

async function configureContext() {
  const created = await zapAction('context', 'newContext', { contextName });
  const contextIdValue = String(created.contextId ?? '');
  if (!/^\d+$/.test(contextIdValue)) throw new Error('ZAP context creation failed.');

  await expectOk(zapAction('context', 'includeInContext', {
    contextName,
    regex: '^https://r24b-staging[.]local/.*$',
  }));
  for (const regex of [
    '^https://r24b-staging[.]local/api/auth/logout.*$',
    '^https://r24b-staging[.]local/api/auth/feishu/.*$',
    '^https://r24b-staging[.]local/login/callback.*$',
  ]) {
    await expectOk(zapAction('context', 'excludeFromContext', { contextName, regex }));
  }
  await expectOk(zapAction('context', 'setContextInScope', {
    contextName,
    booleanInScope: 'true',
  }));
  return contextIdValue;
}

async function configureManualUser(contextIdValue) {
  await expectOk(zapAction('authentication', 'setAuthenticationMethod', {
    contextId: contextIdValue,
    authMethodName: 'manualAuthentication',
    authMethodConfigParams: '',
  }));
  await expectOk(zapAction('authentication', 'setLoggedInIndicator', {
    contextId: contextIdValue,
    loggedInIndicatorRegex: '\\Q"authenticated":true\\E',
  }));
  await expectOk(zapAction('authentication', 'setLoggedOutIndicator', {
    contextId: contextIdValue,
    loggedOutIndicatorRegex: '\\Q"authenticated":false\\E',
  }));
  await expectOk(zapAction('sessionManagement', 'setSessionManagementMethod', {
    contextId: contextIdValue,
    methodName: 'cookieBasedSessionManagement',
    methodConfigParams: '',
  }));
  const created = await zapAction('users', 'newUser', {
    contextId: contextIdValue,
    name: userName,
  });
  const userIdValue = String(created.userId ?? '');
  if (!/^\d+$/.test(userIdValue)) throw new Error('ZAP context user creation failed.');
  await expectOk(zapAction('users', 'setUserEnabled', {
    contextId: contextIdValue,
    userId: userIdValue,
    enabled: 'true',
  }));
  return userIdValue;
}

async function configureHttpSession() {
  await expectOk(zapAction('httpSessions', 'addSessionToken', {
    site: siteName,
    sessionToken: cookieName,
  }));
  await expectOk(zapAction('httpSessions', 'createEmptySession', {
    site: siteName,
    session: sessionName,
  }));
  await expectOk(zapAction('httpSessions', 'setSessionTokenValue', {
    site: siteName,
    session: sessionName,
    sessionToken: cookieName,
    tokenValue: sessionToken,
  }));
  await expectOk(zapAction('httpSessions', 'setActiveSession', {
    site: siteName,
    session: sessionName,
  }));
}

async function verifyAuthenticatedRequests() {
  const results = [];
  for (const requestPath of protectedPaths) {
    const payload = await zapAction('core', 'accessUrl', {
      url: new URL(requestPath, target).href,
      followRedirects: 'false',
    });
    const message = payload.accessUrl?.[0];
    const status = statusFromResponseHeader(message?.responseHeader);
    const sessionAttached = String(message?.requestHeader ?? '').includes(`${cookieName}=`);
    if (status !== 200 || !sessionAttached) {
      throw new Error(`Authenticated ZAP proof failed for ${requestPath}.`);
    }
    results.push({ path: requestPath, status, sessionAttached: true });
  }
  return results;
}

async function assertUnauthenticatedBoundary() {
  const response = await fetch('http://127.0.0.1:8080/api/projects', {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (response.status !== 401) {
    throw new Error(`Unauthenticated project boundary returned ${response.status}, expected 401.`);
  }
}

async function createGetOnlyOpenApi() {
  const response = await fetch('http://127.0.0.1:8080/api/docs-json', {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAPI retrieval failed with ${response.status}.`);
  const document = await response.json();
  const safePaths = {};
  let operationCount = 0;
  for (const [route, operations] of Object.entries(document.paths ?? {})) {
    if (!operations || typeof operations !== 'object' || !operations.get) continue;
    safePaths[route] = {
      ...(operations.parameters ? { parameters: operations.parameters } : {}),
      get: operations.get,
    };
    operationCount += 1;
  }
  const filtered = {
    ...document,
    servers: [{ url: target.origin }],
    paths: safePaths,
  };
  const outputPath = path.join(runtimeDir, 'r24b-get-only-openapi.json');
  await writeFile(outputPath, `${JSON.stringify(filtered)}\n`, { mode: 0o600 });
  return { getOperationCount: operationCount, specification: 'runtime GET-only OpenAPI copy' };
}

async function runTraditionalSpider(contextIdValue, userIdValue) {
  await expectOk(zapAction('spider', 'setOptionProcessForm', { Boolean: 'false' }));
  await expectOk(zapAction('spider', 'setOptionMaxDepth', { Integer: '5' }));
  const started = await zapAction('spider', 'scanAsUser', {
    contextId: contextIdValue,
    userId: userIdValue,
    url: target.href,
    maxChildren: '200',
    recurse: 'true',
    subtreeOnly: 'true',
  });
  const scanId = numericId(started.scanAsUser, 'traditional spider');
  await waitForPercent('spider', scanId, 100, 5 * 60_000);
  const result = await zapView('spider', 'results', { scanId });
  const urls = Array.isArray(result.results) ? result.results.map(String) : [];
  assertOnlyTargetUrls(urls);
  return { status: 'PASS', urlCount: urls.length };
}

async function runAjaxSpider() {
  await expectOk(zapAction('ajaxSpider', 'setOptionScopeCheck', { String: 'STRICT' }));
  await expectOk(zapAction('ajaxSpider', 'setOptionLogoutAvoidance', { Boolean: 'true' }));
  const scope = await zapView('ajaxSpider', 'optionScopeCheck');
  if (String(scope.ScopeCheck).toLowerCase() !== 'strict') {
    throw new Error('AJAX spider strict scope could not be verified.');
  }
  const started = await zapAction('ajaxSpider', 'scanAsUser', {
    contextName,
    userName,
    url: target.href,
    subtreeOnly: 'true',
  });
  if (started.Result !== 'OK') throw new Error('AJAX spider failed to start.');
  const deadline = Date.now() + 3 * 60_000;
  let status = 'running';
  while (Date.now() < deadline) {
    const payload = await zapView('ajaxSpider', 'status');
    status = String(payload.status ?? '').toLowerCase();
    if (status === 'stopped') break;
    await delay(2_000);
  }
  if (status !== 'stopped') {
    await expectOk(zapAction('ajaxSpider', 'stop'));
    status = 'stopped-at-duration-limit';
  }
  const results = await zapView('ajaxSpider', 'results', { start: '0', count: '1000' });
  const urls = (Array.isArray(results.results) ? results.results : [])
    .map((entry) => String(entry?.requestHeader ?? '').split(/\r?\n/, 1)[0])
    .filter(Boolean);
  const scopeSummary = summarizeStrictScopeResults(urls);
  return {
    status: 'PASS',
    completion: status,
    resultCount: scopeSummary.targetCount,
    strictScope: true,
    blockedOutOfScopeCount: scopeSummary.outOfScopeCount,
  };
}

async function importGetOnlyOpenApi(contextIdValue, userIdValue) {
  const imported = await zapAction('openapi', 'importFile', {
    file: '/zap/wrk/r24b-get-only-openapi.json',
    target: target.origin,
    contextId: contextIdValue,
    userId: userIdValue,
  });
  if (imported.code) throw new Error(`OpenAPI import failed: ${imported.code}.`);
  const errors = Array.isArray(imported.errors) ? imported.errors : [];
  if (errors.length > 0) throw new Error('GET-only OpenAPI import reported errors.');
  return { status: 'PASS' };
}

async function runLowRiskActiveScan(contextIdValue, userIdValue) {
  const policyName = 'R24B Low Risk';
  const scannerInventory = await zapView('ascan', 'scanners');
  const availableIds = new Set(
    (Array.isArray(scannerInventory.scanners) ? scannerInventory.scanners : [])
      .map((scanner) => Number(scanner?.id))
      .filter(Number.isInteger),
  );
  const enabledScannerIds = safeScannerIds.filter((id) => availableIds.has(id));
  if (enabledScannerIds.length === 0) {
    throw new Error('No approved low-risk active scanner is available in the pinned ZAP image.');
  }
  await expectOk(zapAction('ascan', 'addScanPolicy', { scanPolicyName: policyName }));
  await expectOk(zapAction('ascan', 'disableAllScanners', { scanPolicyName: policyName }));
  await expectOk(zapAction('ascan', 'enableScanners', {
    ids: enabledScannerIds.join(','),
    scanPolicyName: policyName,
  }));
  for (const id of enabledScannerIds) {
    await expectOk(zapAction('ascan', 'setScannerAttackStrength', {
      id: String(id),
      attackStrength: 'LOW',
      scanPolicyName: policyName,
    }));
    await expectOk(zapAction('ascan', 'setScannerAlertThreshold', {
      id: String(id),
      alertThreshold: 'MEDIUM',
      scanPolicyName: policyName,
    }));
  }
  await expectOk(zapAction('ascan', 'setOptionThreadPerHost', { Integer: '1' }));
  await expectOk(zapAction('ascan', 'setOptionDelayInMs', { Integer: '100' }));
  await expectOk(zapAction('core', 'setMode', { mode: 'protect' }));

  const scans = [];
  for (const requestPath of activePaths) {
    const started = await zapAction('ascan', 'scanAsUser', {
      contextId: contextIdValue,
      userId: userIdValue,
      url: new URL(requestPath, target).href,
      recurse: 'false',
      inScopeOnly: 'true',
      scanPolicyName: policyName,
      method: 'GET',
      postData: '',
    });
    const scanId = numericId(started.scanAsUser, `active scan ${requestPath}`);
    await waitForPercent('ascan', scanId, 100, 5 * 60_000);
    scans.push({ path: requestPath, status: 'PASS' });
  }
  return {
    status: 'PASS',
    strength: 'LOW',
    delayMs: 100,
    approvedScannerCount: enabledScannerIds.length,
    unavailableApprovedScannerCount: safeScannerIds.length - enabledScannerIds.length,
    requests: scans,
  };
}

async function collectAuthenticationStats() {
  const payload = await zapView('stats', 'allSitesStats', { keyPrefix: 'stats.auth' });
  const text = JSON.stringify(payload);
  if (text.includes(sessionToken)) throw new Error('Authentication statistics unexpectedly contain session material.');
  const entries = [];
  walkStats(payload, entries);
  return {
    available: entries.length > 0,
    keyCount: entries.length,
    nonZeroCount: entries.filter((entry) => Number(entry.value) > 0).length,
  };
}

async function waitForPassiveScan() {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const payload = await zapView('pscan', 'recordsToScan');
    if (Number(payload.recordsToScan) === 0) return;
    await delay(1_000);
  }
  throw new Error('Passive scan did not drain before the time limit.');
}

async function waitForPercent(component, scanId, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await zapView(component, 'status', { scanId });
    if (Number(payload.status) >= expected) return;
    await delay(1_000);
  }
  await zapAction(component, 'stop', { scanId }).catch(() => undefined);
  throw new Error(`${component} scan ${scanId} exceeded its time limit.`);
}

function assertOnlyTargetUrls(urls) {
  for (const value of urls) {
    if (forbiddenTargetPattern.test(value)) throw new Error('A scan component reached a forbidden domain.');
    const match = value.match(/https?:\/\/[^\s/]+/i)?.[0];
    if (match && new URL(match).hostname !== target.hostname) {
      throw new Error('A scan component reached a host outside the staging context.');
    }
  }
}

function summarizeStrictScopeResults(urls) {
  let targetCount = 0;
  let outOfScopeCount = 0;
  for (const value of urls) {
    const match = value.match(/https?:\/\/[^\s/]+/i)?.[0];
    if (!match) continue;
    if (new URL(match).hostname === target.hostname) targetCount += 1;
    else outOfScopeCount += 1;
  }
  return { targetCount, outOfScopeCount };
}

function assertReportHasNoAuthenticationMaterial(...reports) {
  for (const report of reports) {
    const text = report.toString('utf8');
    if (text.includes(sessionToken) || text.includes(String(sessionDocument.cookieHeader))) {
      throw new Error('ZAP report contains authentication material and was not written.');
    }
  }
}

function countRisks(report) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Informational: 0 };
  for (const site of Array.isArray(report.site) ? report.site : []) {
    for (const alert of Array.isArray(site.alerts) ? site.alerts : []) {
      const risk = String(alert.riskdesc ?? alert.risk ?? '').split(/\s|\(/, 1)[0];
      const normalized = risk === 'Info' ? 'Informational' : risk;
      if (normalized in counts) counts[normalized] += 1;
    }
  }
  return counts;
}

async function generateScopedReport(template, reportFileName) {
  const generated = await zapAction('reports', 'generate', {
    title: 'R24B Authenticated ZAP',
    template,
    theme: '',
    description: 'Authorized staging-only authenticated security scan.',
    contexts: contextName,
    sites: target.origin,
    sections: '',
    includedConfidences: '',
    includedRisks: '',
    reportFileName,
    reportDir: '/zap/wrk/scoped-reports',
    display: 'false',
  });
  if (typeof generated.generate !== 'string' || generated.generate.length === 0) {
    throw new Error(`ZAP did not generate the scoped ${template} report.`);
  }
}

function walkStats(value, result, prefix = '') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkStats(entry, result, `${prefix}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (/auth/i.test(key) && (typeof nested === 'number' || /^\d+$/.test(String(nested)))) {
        result.push({ key: next, value: Number(nested) });
      } else {
        walkStats(nested, result, next);
      }
    }
  }
}

async function zapAction(component, action, params = {}) {
  return zapJson(`/JSON/${component}/action/${action}/`, params);
}

async function zapView(component, view, params = {}) {
  return zapJson(`/JSON/${component}/view/${view}/`, params);
}

async function zapJson(apiPath, params = {}) {
  const body = await zapRaw(apiPath, params);
  const payload = JSON.parse(body.toString('utf8'));
  if (payload.code) throw new Error(`ZAP API ${apiPath} failed: ${payload.code}.`);
  return payload;
}

async function zapRaw(apiPath, params = {}) {
  const requestUrl = new URL(apiPath, zapApi);
  for (const [key, value] of Object.entries(params)) requestUrl.searchParams.set(key, String(value));
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: requestUrl.hostname,
      port: requestUrl.port,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: { Host: 'zap' },
      timeout: 30_000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`ZAP API ${apiPath} returned HTTP ${response.statusCode}.`));
          return;
        }
        resolve(body);
      });
    });
    request.on('timeout', () => request.destroy(new Error(`ZAP API ${apiPath} timed out.`)));
    request.on('error', reject);
  });
}

async function expectOk(promise) {
  const result = await promise;
  if (result.Result !== 'OK') throw new Error('ZAP API action did not return OK.');
  return result;
}

function statusFromResponseHeader(header) {
  const match = String(header ?? '').split(/\r?\n/, 1)[0].match(/\s(\d{3})\s/);
  return match ? Number(match[1]) : null;
}

function numericId(value, label) {
  const normalized = String(value ?? '');
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} did not return a scan id.`);
  return normalized;
}

function extractCookieValue(header, name) {
  if (typeof header !== 'string') throw new Error('Temporary session document has no cookie header.');
  const values = new Map(
    header.split(';').map((entry) => entry.trim()).filter((entry) => entry.includes('='))
      .map((entry) => entry.split(/=(.*)/s).slice(0, 2)),
  );
  const value = values.get(name);
  if (!value) throw new Error('Temporary session document has no staging session cookie.');
  return value;
}

async function validateSessionFile(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('R24B_SESSION_FILE must be absolute.');
  const resolved = path.resolve(value);
  const allowed = resolved.startsWith('/tmp/r24b-zap-auth.') ||
    resolved.startsWith('/private/tmp/r24b-zap-auth.');
  if (!allowed) throw new Error('R24B session file must be outside the repository under /tmp.');
  const metadata = await stat(resolved);
  if ((metadata.mode & 0o077) !== 0) throw new Error('R24B session file permissions must be 600.');
  return resolved;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
