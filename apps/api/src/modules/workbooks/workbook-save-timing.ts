import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';

const MARKS = ['parsed', 'serviceEnter', 'validated', 'transactionStart', 'transactionEnter', 'locksAcquired', 'writeStart', 'writeEnd', 'commandEnd', 'transactionEnd', 'serviceEnd'] as const;
type Mark = typeof MARKS[number];
export interface WorkbookSaveTiming { mark(name: Mark): void }
type Middleware = (request: Request, response: Response, next: NextFunction) => unknown;
const traces = new WeakMap<Request, WorkbookSaveTiming>();
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export const workbookSaveTiming = (request: Request) => traces.get(request);

/** One local diagnostic request per process. No configuration means the exact
 * original parser. This neither changes the 8 MiB parser nor authorizes a write. */
export function observeWorkbookSave(
  parser: Middleware, env: NodeJS.ProcessEnv = process.env,
  emit: (line: string) => void = line => { process.stdout.write(`${line}\n`); },
): Middleware {
  if (!env.WORKBOOK_SAVE_TIMING) return parser;
  let config: { workbookId: string; expectedRevision: number; traceId: string; expiresAt: number };
  try {
    if (env.WORKBOOK_SAVE_TIMING.length > 1024 || env.LOCAL_RUNTIME_PROFILE !== 'loopback-https'
        || env.NODE_ENV !== 'production' || env.DEPLOYMENT_ENV !== 'staging' || env.HOST !== '127.0.0.1') return parser;
    config = JSON.parse(env.WORKBOOK_SAVE_TIMING);
    if (!config || Object.keys(config).sort().join(',') !== 'expectedRevision,expiresAt,traceId,workbookId'
        || typeof config.workbookId !== 'string' || typeof config.traceId !== 'string'
        || !uuid.test(config.workbookId) || !uuid.test(config.traceId)
        || !Number.isSafeInteger(config.expectedRevision) || config.expectedRevision < 1
        || !Number.isSafeInteger(config.expiresAt) || config.expiresAt <= Date.now() || config.expiresAt > Date.now() + 600_000) return parser;
  } catch { return parser; }
  let available = true;
  return (request, response, next) => {
    if (!available || Date.now() >= config.expiresAt || request.method !== 'PUT'
        || request.path !== `/api/workbooks/${config.workbookId}`) return parser(request, response, next);
    available = false; // Consume before parsing; failures and mismatches never rearm.
    const started = performance.now(), marks: Partial<Record<Mark, number>> = {};
    let closed = false, parserCallbackError = false, operationId: string | null = null;
    const elapsed = () => Math.round((performance.now() - started) * 1000) / 1000;
    const timing: WorkbookSaveTiming = { mark(name) {
      if (!closed && MARKS.includes(name) && marks[name] === undefined) marks[name] = elapsed();
    } };
    const finish = (event: 'finish' | 'close' | 'timeout' | 'parserThrow') => {
      if (closed) return;
      closed = true; clearTimeout(timer); response.removeListener('finish', onFinish); response.removeListener('close', onClose); traces.delete(request);
      const record = { eventType: 'workbook_save_timing', traceId: config.traceId, workbookId: config.workbookId,
        expectedRevision: config.expectedRevision, operationId, event, parserCallbackError, observedStatusCode: response.statusCode,
        scope: 'local_parser_entry_to_response_event', marks, elapsedMs: elapsed() };
      try { const line = JSON.stringify(record); if (Buffer.byteLength(line) <= 2048) emit(line); } catch { /* Diagnostics must not alter a request result. */ }
    };
    const onFinish = () => finish('finish'), onClose = () => finish('close');
    const timer = setTimeout(() => finish('timeout'), 45_000); timer.unref();
    response.once('finish', onFinish); response.once('close', onClose);
    try {
      return parser(request, response, error => {
        parserCallbackError = Boolean(error);
        timing.mark('parsed');
        if (!closed && !error && request.body && typeof request.body.operationId === 'string' && uuid.test(request.body.operationId)
            && request.body.expectedRevision === config.expectedRevision) {
          operationId = request.body.operationId; traces.set(request, timing);
        }
        next(error);
      });
    } catch (error) { finish('parserThrow'); throw error; }
  };
}
