import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createSameOriginMutationGuard } from './same-origin.middleware';

function invoke(
  method: string,
  origin?: string,
  frontendUrl = 'https://timeline.example.com/',
) {
  const next = vi.fn() as NextFunction;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  const request = {
    method,
    headers: origin === undefined ? {} : { origin },
  } as Request;

  createSameOriginMutationGuard(frontendUrl)(request, response, next);

  return { next, status, json };
}

describe('same-origin mutation guard', () => {
  it('allows safe requests and same-origin mutations', () => {
    expect(invoke('GET', 'https://attacker.example').next).toHaveBeenCalledOnce();
    expect(invoke('POST', 'https://timeline.example.com').next).toHaveBeenCalledOnce();
  });

  it('rejects unsafe requests that omit Origin', () => {
    const result = invoke('PATCH');
    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
  });

  it('fails closed for unsafe requests when the configured frontend origin is invalid', () => {
    const result = invoke('POST', 'https://timeline.example.com', 'not-a-url');
    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
  });

  it('rejects cross-origin, opaque and lookalike origins for unsafe methods', () => {
    for (const origin of [
      'https://attacker.example',
      'null',
      'https://timeline.example.com.attacker.example',
      'not-a-url',
    ]) {
      const result = invoke('POST', origin);
      expect(result.next).not.toHaveBeenCalled();
      expect(result.status).toHaveBeenCalledWith(403);
      expect(result.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403, error: 'Forbidden' }),
      );
    }
  });
});
