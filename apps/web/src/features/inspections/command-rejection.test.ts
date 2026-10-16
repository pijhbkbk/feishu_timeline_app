import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/auth-client', () => ({ ApiRequestError: class extends Error { constructor(message: string, readonly status: number) { super(message); } } }));
import { ApiRequestError } from '../../lib/auth-client';
import { inspectionCommandRejected } from './command-rejection';
describe('single inspection command replay recovery', () => {
  it.each([400, 409])('allows correction after a lost rejection is confirmed as %i', status => {
    expect(inspectionCommandRejected(new Error('response lost'), false)).toBe(false);
    expect(inspectionCommandRejected(new ApiRequestError('rejection from retained original command', status), true)).toBe(true);
  });
  it.each([401, 403, 404, 413, 415, 422, 429, 500])('retains the original request for an unproven replay response %i', status => {
    expect(inspectionCommandRejected(new ApiRequestError('not proof of previous outcome', status), true)).toBe(false);
  });
  it('does not carry uncertainty from a definitively rejected command into a fresh request', () => {
    let ambiguous = true;
    if (inspectionCommandRejected(new ApiRequestError('revision conflict', 409), ambiguous)) ambiguous = false;
    expect(inspectionCommandRejected(new ApiRequestError('fresh request denied', 403), ambiguous)).toBe(true);
  });
});
