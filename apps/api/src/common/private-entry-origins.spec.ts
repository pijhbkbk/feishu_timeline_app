import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { resolveBrowserOrigins } from './private-entry-origins';
import { createSameOriginMutationGuard } from './same-origin.middleware';
const origins = ['https://localhost:18443', 'https://timeline.all-too-well.com'] as const;
function invoke(origin: unknown, host: string, method = 'POST') {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  const next = vi.fn();
  createSameOriginMutationGuard([...origins], true)({ method, headers: {origin, host} } as Request, response as unknown as Response, next);
  return {response, next};
}
describe('explicit private browser entries', () => {
  it('preserves the configured single origin unless explicitly enabled', () => {
    expect(resolveBrowserOrigins('https://timeline.example.com', undefined, 'production')).toEqual(['https://timeline.example.com']);
  });
  it('enables only the approved exact pair', () => {
    expect(resolveBrowserOrigins(origins[0], '1', 'staging')).toEqual(origins);
  });
  it.each([
    ['https://localhost:18443', 'true', 'staging'],
    ['https://localhost:18444', '1', 'staging'],
    ['http://localhost:18443', '1', 'staging'],
    ['https://localhost:18443/', '1', 'staging'],
    ['https://localhost:18443', '1', 'production'],
    ['https://timeline.all-too-well.com', '1', 'staging'],
  ])('rejects an unapproved opt-in combination %s %s %s', (url, flag, env) => {
    expect(() => resolveBrowserOrigins(url, flag, env)).toThrow();
  });
  it.each([
    [origins[0], 'localhost:18443'],
    [origins[1], 'timeline.all-too-well.com'],
    [origins[1], 'timeline.all-too-well.com:443'],
  ])('allows same origin %s with exact host %s', (origin, host) => {
    expect(invoke(origin, host).next).toHaveBeenCalledOnce();
  });
  it.each([
    [origins[0], 'timeline.all-too-well.com'], [origins[1], 'localhost:18443'],
    ['https://timeline.all-too-well.com.evil.test', 'timeline.all-too-well.com'],
    ['https://evil.test', 'timeline.all-too-well.com'], ['null', 'timeline.all-too-well.com'],
    [undefined, 'timeline.all-too-well.com'], [[origins[1]], 'timeline.all-too-well.com'],
    [origins[1]+'/', 'timeline.all-too-well.com'],
    [origins[1]+':443', 'timeline.all-too-well.com'],
    ['https://user@timeline.all-too-well.com', 'timeline.all-too-well.com'],
    [origins[1], 'timeline.all-too-well.com:444'], [origins[1], '192.168.1.5'],
  ])('rejects a malformed or cross-entry write', (origin, host) => {
    const result = invoke(origin, host);expect(result.next).not.toHaveBeenCalled();expect(result.response.status).toHaveBeenCalledWith(403);
  });
  it('does not add business authentication exemptions to safe requests', () => {
    expect(invoke(undefined, 'timeline.all-too-well.com', 'GET').next).toHaveBeenCalledOnce();
  });
});
