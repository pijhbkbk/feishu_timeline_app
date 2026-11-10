import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./auth-client', () => ({ apiRequest: vi.fn() }));
import { apiRequest } from './auth-client';
import { completeExteriorRectification } from './consistency-reviews-client';
const request = Object.freeze({ taskId: 'task-14', expectedTaskVersion: '2026-10-20T00:00:00.000Z', operationId: 'op-1', supplierName: '合成厂家', completedOn: '2026-10-20', summary: '合成整改记录' });
const response = () => ({ receipt: { taskId: 'task-14', operationId: 'op-1', progressUpdateId: 'progress-1' }, workspace: { project: { id: 'p1' } } });
describe('rectification client transport contract (no automatic network retries)', () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
  it('passes the captured immutable body unchanged with a deadline, and validates the receipt', async () => {
    vi.mocked(apiRequest).mockResolvedValue(response());
    await completeExteriorRectification('p1', request);
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenCalledWith('/projects/p1/reviews/consistency/rectification', { method: 'POST', body: request, signal: expect.any(AbortSignal) });
    expect(vi.mocked(apiRequest).mock.calls[0]?.[1]?.body).toBe(request);
  });
  it.each(['task', 'operation', 'progress', 'project'])('rejects mismatched %s acknowledgements', async field => {
    const value = response();
    if (field === 'task') value.receipt.taskId = 'other';
    if (field === 'operation') value.receipt.operationId = 'other';
    if (field === 'progress') value.receipt.progressUpdateId = '';
    if (field === 'project') value.workspace.project.id = 'other';
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(completeExteriorRectification('p1', request)).rejects.toThrow('回执不匹配');
    expect(apiRequest).toHaveBeenCalledOnce();
  });
  it('returns unknown transport failure to the caller without replacing body or operation id', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network-lost-ack'));
    await expect(completeExteriorRectification('p1', request)).rejects.toThrow('network-lost-ack');
    expect(apiRequest).toHaveBeenCalledOnce(); expect(request.operationId).toBe('op-1');
  });
});
