import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  API_BASE_URL: '/api',
  apiRequest: vi.fn(),
}));

import { apiRequest } from './auth-client';
import {
  fetchAttachmentsWorkspace,
  uploadTaskMaterial,
} from './attachments-client';

const mockedApiRequest = vi.mocked(apiRequest);

describe('R26 task material upload client', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({ attachment: { id: 'attachment-new' } });
  });

  it('uses the dedicated task material endpoint with task version and a fresh idempotency header', async () => {
    await uploadTaskMaterial(
      'task-1',
      new File(['%PDF-1.7'], 'evidence.pdf', { type: 'application/pdf' }),
      {
        materialType: 'WORK_EVIDENCE',
        taskVersion: '2026-08-11T04:00:00.000Z',
      },
    );
    await uploadTaskMaterial(
      'task-1',
      new File(['%PDF-1.7'], 'evidence-2.pdf', { type: 'application/pdf' }),
      {
        materialType: 'WORK_EVIDENCE',
        taskVersion: '2026-08-11T04:00:01.000Z',
      },
    );

    expect(mockedApiRequest).toHaveBeenCalledTimes(2);
    const [firstPath, firstOptions] = mockedApiRequest.mock.calls[0]!;
    const [secondPath, secondOptions] = mockedApiRequest.mock.calls[1]!;
    const firstHeaders = firstOptions?.headers as Record<string, string>;
    const secondHeaders = secondOptions?.headers as Record<string, string>;
    const firstBody = firstOptions?.body as FormData;

    expect(firstPath).toBe('/v2/tasks/task-1/materials');
    expect(secondPath).toBe('/v2/tasks/task-1/materials');
    expect(firstPath).not.toContain('/projects/');
    expect(firstBody.get('materialType')).toBe('WORK_EVIDENCE');
    expect(firstBody.get('taskVersion')).toBe('2026-08-11T04:00:00.000Z');
    expect(firstBody.get('idempotencyKey')).toBe(firstHeaders['Idempotency-Key']);
    expect(firstHeaders['X-Request-Id']).toBe(firstHeaders['Idempotency-Key']);
    expect(secondHeaders['Idempotency-Key']).not.toBe(firstHeaders['Idempotency-Key']);
  });

  it('uses the dedicated versions endpoint for replacement uploads', async () => {
    await uploadTaskMaterial(
      'task/encoded',
      new File(['%PDF-1.7'], 'replacement.pdf', { type: 'application/pdf' }),
      {
        materialType: 'WORK_EVIDENCE',
        taskVersion: '2026-08-11T04:00:00.000Z',
        replacesAttachmentId: 'attachment/old',
      },
    );

    const [path, options] = mockedApiRequest.mock.calls[0]!;
    const body = options?.body as FormData;

    expect(path).toBe(
      '/v2/tasks/task%2Fencoded/materials/attachment%2Fold/versions',
    );
    expect(body.get('replacesAttachmentId')).toBe('attachment/old');
    expect(path).not.toContain('/projects/');
  });

  it('sends the bounded attachment cursor and page size without changing the filter scope', async () => {
    await fetchAttachmentsWorkspace('project-1', {
      entityType: 'PROJECT',
      entityId: 'project/1',
      includeDeleted: true,
      cursor: 'attachment/100',
      pageSize: 100,
    });

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/projects/project-1/attachments?entityType=PROJECT&entityId=project%2F1&includeDeleted=true&cursor=attachment%2F100&pageSize=100',
    );
  });
});
