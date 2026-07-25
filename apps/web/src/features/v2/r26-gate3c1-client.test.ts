import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGate3C1IdempotencyKey,
  r26Gate3C1Request,
} from './r26-gate3c1-client';

describe('R26 Gate 3C1 ordinary completion client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    '/v2/tasks/task-1/completion-preview',
    '/v2/tasks/task-1/complete',
    '/v2/tasks/task-1/blockers/blocker-1/resolve',
  ])('allows only the explicit Gate 3C1 path %s', async (path) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await r26Gate3C1Request(path, {
      body: { taskVersion: '2026-07-24T00:00:00.000Z' },
      idempotencyKey: 'r26-g3c1:test:00000001',
    });

    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-R26-Gate': '3C1-ordinary-completion',
      'Idempotency-Key': 'r26-g3c1:test:00000001',
    });
  });

  it.each([
    '/v2/tasks/task-1/approve',
    '/v2/tasks/task-1/reject',
    '/v2/tasks/task-1/fee',
    '/v2/tasks/task-1/monthly-review',
    '/v2/tasks/task-1/color-exit',
    '/v2/tasks/task-1/transition',
    '/v2/projects/project-1/members',
  ])('blocks every out-of-scope write %s', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      r26Gate3C1Request(path, { body: {} }),
    ).rejects.toThrow(
      'R26 Gate 3C1 只允许普通工序完成预览、完成命令和阻塞解除。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates unique, Gate-labelled idempotency keys', () => {
    const first = createGate3C1IdempotencyKey('complete');
    const second = createGate3C1IdempotencyKey('complete');

    expect(first).toMatch(/^r26-g3c1:complete:/);
    expect(second).toMatch(/^r26-g3c1:complete:/);
    expect(first).not.toBe(second);
  });
});
