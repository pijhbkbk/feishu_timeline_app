'use client';

import { API_BASE_URL, normalizeApiErrorMessage } from '../../lib/auth-client';

export async function r26ReadOnlyGet<T>(
  path: string,
  options: { signal?: AbortSignal } = {},
) {
  if (!path.startsWith('/v2/')) {
    throw new Error('R26 Gate 2 只允许访问 V2 只读接口。');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-R26-Gate': '2-read-only',
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new Error(
      normalizeApiErrorMessage(error instanceof Error ? error.message : undefined),
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
