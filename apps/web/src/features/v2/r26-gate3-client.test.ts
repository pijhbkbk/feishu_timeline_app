import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIdempotencyKey,
  r26Gate3Request,
} from './r26-gate3-client';

describe('R26 Gate 3A scoped write client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a credentialed JSON request only to a Gate 3A endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ command: { action: 'MEMBER_ADD' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await r26Gate3Request('/v2/projects/project-1/members', {
      method: 'POST',
      body: {
        expectedVersion: 1,
        idempotencyKey: createIdempotencyKey('add'),
      },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.body).toContain('"expectedVersion":1');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-R26-Gate': '3A-member-assignment',
    });
  });

  it.each([
    ['/v2/tasks/task-1/progress', 'POST'],
    ['/v2/attachments', 'POST'],
    ['/v2/projects/project-1/workflow', 'PATCH'],
    ['/v2/projects/project-1/tasks/task-1/assignment', 'DELETE'],
    ['/v2/projects/project-1/members', 'DELETE'],
  ] as const)('blocks out-of-scope request %s %s', async (path, method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      r26Gate3Request(path, {
        method,
        body: {},
      }),
    ).rejects.toThrow('R26 Gate 3A 只允许成员与任务分配接口。');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
