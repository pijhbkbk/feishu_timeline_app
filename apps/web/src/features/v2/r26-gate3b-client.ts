'use client';

import {
  API_BASE_URL,
  normalizeApiErrorMessage,
} from '../../lib/auth-client';

type JsonMethod = 'PUT' | 'POST' | 'DELETE';

export async function r26Gate3BJsonRequest<T>(
  path: string,
  options: {
    method: JsonMethod;
    body: Record<string, unknown>;
    idempotencyKey: string;
    signal?: AbortSignal;
  },
) {
  if (!isAllowedJsonRequest(path, options.method)) {
    throw new Error(
      'R26 Gate 3B 只允许进展草稿和正式进展接口，不允许流程动作。',
    );
  }
  return request<T>(path, {
    method: options.method,
    idempotencyKey: options.idempotencyKey,
    body: JSON.stringify(options.body),
    contentType: 'application/json',
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export async function r26Gate3BUpload<T>(
  path: string,
  options: {
    formData: FormData;
    idempotencyKey: string;
    signal?: AbortSignal;
  },
) {
  if (!isAllowedUploadRequest(path)) {
    throw new Error(
      'R26 Gate 3B 只允许当前工序材料上传与版本替换接口。',
    );
  }
  return request<T>(path, {
    method: 'POST',
    idempotencyKey: options.idempotencyKey,
    body: options.formData,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function createGate3BIdempotencyKey(action: string) {
  return `r26-g3b:${action}:${createRequestId()}`;
}

async function request<T>(
  path: string,
  options: {
    method: JsonMethod;
    idempotencyKey: string;
    body: BodyInit;
    contentType?: string;
    signal?: AbortSignal;
  },
) {
  const requestId = createRequestId();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.contentType
          ? { 'Content-Type': options.contentType }
          : {}),
        'X-R26-Gate': '3B-progress-materials',
        'X-Request-Id': requestId,
        'Idempotency-Key': options.idempotencyKey,
      },
      body: options.body,
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
    throw new Error(normalizeApiErrorMessage(rawMessage, response.status));
  }
  return body as T;
}

function isAllowedJsonRequest(path: string, method: JsonMethod) {
  if (/^\/v2\/tasks\/[^/]+\/progress-draft$/.test(path)) {
    return method === 'PUT' || method === 'DELETE';
  }
  if (/^\/v2\/tasks\/[^/]+\/progress-updates$/.test(path)) {
    return method === 'POST';
  }
  return false;
}

function isAllowedUploadRequest(path: string) {
  return (
    /^\/v2\/tasks\/[^/]+\/materials$/.test(path) ||
    /^\/v2\/tasks\/[^/]+\/materials\/[^/]+\/versions$/.test(path)
  );
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
