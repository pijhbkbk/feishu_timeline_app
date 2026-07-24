'use client';

import {
  API_BASE_URL,
  normalizeApiErrorMessage,
} from '../../lib/auth-client';

export async function r26Gate3Request<T>(
  path: string,
  options: {
    method: 'POST' | 'PATCH' | 'DELETE';
    body: Record<string, unknown>;
    signal?: AbortSignal;
  },
) {
  if (!isAllowedGate3Request(path, options.method)) {
    throw new Error('R26 Gate 3A 只允许成员与任务分配接口。');
  }

  const requestId = createRequestId();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-R26-Gate': '3A-member-assignment',
        'X-Request-Id': requestId,
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
    | { message?: string | string[]; code?: string }
    | null;

  if (!response.ok) {
    const rawMessage =
      body && typeof body === 'object' && 'message' in body
        ? Array.isArray(body.message)
          ? body.message.join('；')
          : body.message
        : undefined;
    throw new Error(normalizeApiErrorMessage(rawMessage, response.status));
  }

  return body as T;
}

export function createIdempotencyKey(action: string) {
  return `r26-g3a:${action}:${createRequestId()}`;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAllowedGate3Request(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
) {
  if (
    /^\/v2\/projects\/[^/]+\/assignment-preview$/.test(path) ||
    /^\/v2\/projects\/[^/]+\/assignments\/apply$/.test(path)
  ) {
    return method === 'POST';
  }
  if (/^\/v2\/projects\/[^/]+\/members$/.test(path)) {
    return method === 'POST';
  }
  if (/^\/v2\/projects\/[^/]+\/members\/[^/]+$/.test(path)) {
    return method === 'PATCH' || method === 'DELETE';
  }
  if (
    /^\/v2\/projects\/[^/]+\/tasks\/[^/]+\/assignment$/.test(path)
  ) {
    return method === 'PATCH';
  }
  return false;
}
