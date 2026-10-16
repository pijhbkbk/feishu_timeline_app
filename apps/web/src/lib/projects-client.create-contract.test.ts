import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProject } from './projects-client';

describe('projects client create contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a fresh bounded Idempotency-Key for each explicit create attempt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'project-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await createProject({ name: '项目一', priority: 'HIGH' });
    await createProject({ name: '项目一', priority: 'HIGH' });

    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    const firstKey = firstHeaders.get('Idempotency-Key');
    const secondKey = secondHeaders.get('Idempotency-Key');

    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).not.toBe(firstKey);
  });

  it('reuses an explicit Idempotency-Key when the UI retries the same payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'project-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const retryKey = 'project-create:retry-00000001';
    const payload = { name: '项目一', priority: 'HIGH' } as const;

    await (
      createProject as unknown as (
        body: typeof payload,
        idempotencyKey: string,
      ) => Promise<unknown>
    )(payload, retryKey);
    await (
      createProject as unknown as (
        body: typeof payload,
        idempotencyKey: string,
      ) => Promise<unknown>
    )(payload, retryKey);

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      retryKey,
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe(
      retryKey,
    );
  });
});
