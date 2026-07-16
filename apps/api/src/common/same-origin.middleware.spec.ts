import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createSameOriginMutationGuard } from './same-origin.middleware';

function invoke(method: string, origin?: string) {
  const next = vi.fn() as NextFunction;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  const request = {
    method,
    headers: origin === undefined ? {} : { origin },
  } as Request;

  createSameOriginMutationGuard('https://timeline.example.com/')(request, response, next);

  return { next, status, json };
}

describe('same-origin mutation guard', () => {
  it('allows safe requests and same-origin mutations', () => {
    expect(invoke('GET', 'https://attacker.example').next).toHaveBeenCalledOnce();
    expect(invoke('POST', 'https://timeline.example.com').next).toHaveBeenCalledOnce();
    expect(invoke('PATCH').next).toHaveBeenCalledOnce();
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
