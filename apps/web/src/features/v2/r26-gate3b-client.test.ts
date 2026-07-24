import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGate3BIdempotencyKey,
  r26Gate3BJsonRequest,
  r26Gate3BUpload,
} from './r26-gate3b-client';

describe('R26 Gate 3B scoped write client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends progress writes with credentials and Idempotency-Key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          progressSubmitted: true,
          taskStatusChanged: false,
          workflowTransitioned: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const idempotencyKey = createGate3BIdempotencyKey('submit');

    await r26Gate3BJsonRequest('/v2/tasks/task-1/progress-updates', {
      method: 'POST',
      idempotencyKey,
      body: { idempotencyKey },
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-R26-Gate': '3B-progress-materials',
      'Idempotency-Key': idempotencyKey,
    });
  });

  it('uses multipart only for current-task material endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ materialUploaded: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.append('file', new Blob(['%PDF-']), '证明.pdf');

    await r26Gate3BUpload('/v2/tasks/task-1/materials', {
      formData,
      idempotencyKey: 'r26-g3b:upload:00000001',
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBe(formData);
    expect(options.headers).not.toHaveProperty('Content-Type');
  });

  it.each([
    ['/v2/tasks/task-1/complete', 'POST'],
    ['/v2/tasks/task-1/approve', 'POST'],
    ['/v2/tasks/task-1/reject', 'POST'],
    ['/v2/workflows/task-1/transition', 'POST'],
    ['/v2/projects/project-1/members', 'POST'],
    ['/v2/projects/project-1/tasks/task-1/assignment', 'POST'],
  ] as const)('blocks forbidden Gate 3C or assignment request %s', async (path, method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      r26Gate3BJsonRequest(path, {
        method,
        idempotencyKey: 'r26-g3b:blocked:00000001',
        body: {},
      }),
    ).rejects.toThrow(
      'R26 Gate 3B 只允许进展草稿和正式进展接口，不允许流程动作。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks material uploads outside the current task scope', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      r26Gate3BUpload('/v2/projects/project-1/attachments/upload', {
        formData: new FormData(),
        idempotencyKey: 'r26-g3b:blocked-upload:00000001',
      }),
    ).rejects.toThrow(
      'R26 Gate 3B 只允许当前工序材料上传与版本替换接口。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
