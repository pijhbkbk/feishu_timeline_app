'use client';

import {
  API_BASE_URL,
  normalizeApiErrorMessage,
} from '../../lib/auth-client';

export async function r26Gate3C1Request<T>(
  path: string,
  options: {
    body: Record<string, unknown>;
    idempotencyKey?: string;
    signal?: AbortSignal;
  },
) {
  if (!isAllowedGate3C1Request(path)) {
    throw new Error(
      'R26 Gate 3C1 只允许普通工序完成预览、完成命令和阻塞解除。',
    );
  }
  const requestId = createRequestId();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-R26-Gate': '3C1-ordinary-completion',
        'X-Request-Id': requestId,
        ...(options.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(options.body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error(
      normalizeApiErrorMessage(
        error instanceof Error ? error.message : undefined,
      ),
      { cause: error },
    );
  }

  const body = (await response.json().catch(() => null)) as
    | T
    | { message?: string | string[] }
    | null;
  if (!response.ok) {
    const rawMessage =
      body && typeof body === 'object' && 'message' in body
        ? Array.isArray(body.message)
          ? body.message.join('；')
          : body.message
        : undefined;
    throw new Error(
      normalizeApiErrorMessage(rawMessage, response.status),
    );
  }
  return body as T;
}

export function createGate3C1IdempotencyKey(action: string) {
  return `r26-g3c1:${action}:${createRequestId()}`;
}

function isAllowedGate3C1Request(path: string) {
  return (
    /^\/v2\/tasks\/[^/]+\/completion-preview$/.test(path) ||
    /^\/v2\/tasks\/[^/]+\/complete$/.test(path) ||
    /^\/v2\/tasks\/[^/]+\/blockers\/[^/]+\/resolve$/.test(path)
  );
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
