import { HttpException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import {
  UPLOAD_RATE_TRACKER_MAX_ACTORS,
  UploadAdmissionService,
} from './upload-admission.service';

function createRequest(actorId?: string, projectId = 'project-1') {
  return {
    authUser: actorId ? { id: actorId } : undefined,
    params: { projectId },
  } as unknown as AuthenticatedRequest;
}

function createGate(overrides: Record<string, number> = {}) {
  const values: Record<string, number> = {
    uploadAdmissionGlobalLimit: 4,
    uploadAdmissionPerActorLimit: 2,
    uploadAdmissionPerTargetLimit: 3,
    uploadAdmissionRateMaxRequests: 6,
    uploadAdmissionRateWindowMs: 60_000,
    ...overrides,
  };
  const configService = {
    get: vi.fn((key: string) => values[key]),
  };

  return new UploadAdmissionService(configService as never);
}

function expectRejection(action: () => unknown, code: string, retryAfterSeconds = 1) {
  try {
    action();
    throw new Error('Expected upload admission to reject.');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
    expect(error).toMatchObject({ retryAfterSeconds });
  }
}

describe('UploadAdmissionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails closed when the authenticated actor was not established before multipart parsing', () => {
    const gate = createGate();

    expect(() => gate.acquire(createRequest())).toThrow(UnauthorizedException);
  });

  it('rejects a second concurrent upload from the same authenticated actor', () => {
    const gate = createGate({ uploadAdmissionPerActorLimit: 1 });
    const heldLease = gate.acquire(createRequest('actor-1'));

    expectRejection(
      () => gate.acquire(createRequest('actor-1', 'project-2')),
      'UPLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
    );
    heldLease.release();
  });

  it('rejects concurrent uploads to the same route target across different actors', () => {
    const gate = createGate({ uploadAdmissionPerTargetLimit: 1 });
    const heldLease = gate.acquire(createRequest('actor-1', 'project-1'));

    expectRejection(
      () => gate.acquire(createRequest('actor-2', 'project-1')),
      'UPLOAD_PER_TARGET_CONCURRENCY_LIMIT',
    );
    heldLease.release();
  });

  it('uses taskId as the target for v2 upload routes that do not carry projectId', () => {
    const gate = createGate({ uploadAdmissionPerTargetLimit: 1 });
    const firstRequest = createRequest('actor-1', '');
    firstRequest.params = { taskId: 'task-1' };
    const secondRequest = createRequest('actor-2', '');
    secondRequest.params = { taskId: 'task-1' };
    const heldLease = gate.acquire(firstRequest);

    expectRejection(
      () => gate.acquire(secondRequest),
      'UPLOAD_PER_TARGET_CONCURRENCY_LIMIT',
    );
    heldLease.release();
  });

  it('rejects another actor when the per-process global upload limit is occupied', () => {
    const gate = createGate({
      uploadAdmissionGlobalLimit: 1,
      uploadAdmissionPerActorLimit: 1,
    });
    const heldLease = gate.acquire(createRequest('actor-1', 'project-1'));

    expectRejection(
      () => gate.acquire(createRequest('actor-2', 'project-2')),
      'UPLOAD_GLOBAL_CONCURRENCY_LIMIT',
    );
    heldLease.release();
  });

  it('enforces a sliding per-actor admission rate and reports the retry window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    const gate = createGate({
      uploadAdmissionRateMaxRequests: 2,
      uploadAdmissionRateWindowMs: 10_000,
    });

    gate.acquire(createRequest('actor-1')).release();
    vi.advanceTimersByTime(1_000);
    gate.acquire(createRequest('actor-1')).release();

    expectRejection(
      () => gate.acquire(createRequest('actor-1')),
      'UPLOAD_RATE_LIMIT',
      9,
    );

    vi.advanceTimersByTime(9_001);
    expect(() => gate.acquire(createRequest('actor-1'))).not.toThrow();
  });

  it('deletes expired actor rate entries instead of retaining an unbounded offline-actor map', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    const gate = createGate({ uploadAdmissionRateWindowMs: 1_000 });
    gate.acquire(createRequest('expired-actor')).release();

    vi.advanceTimersByTime(1_001);
    gate.acquire(createRequest('current-actor')).release();

    expect(
      (gate as unknown as { admittedAtByActor: Map<string, number[]> })
        .admittedAtByActor.has('expired-actor'),
    ).toBe(false);
  });

  it('fails closed at the bounded rate-tracker actor capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    const gate = createGate();

    for (let index = 0; index < UPLOAD_RATE_TRACKER_MAX_ACTORS; index += 1) {
      gate.acquire(createRequest(`actor-${index}`)).release();
    }

    expectRejection(
      () => gate.acquire(createRequest('one-actor-too-many')),
      'UPLOAD_RATE_TRACKER_CAPACITY',
      60,
    );
  });

  it('makes lease release idempotent so error and cancellation cleanup cannot underflow counters', () => {
    const gate = createGate({
      uploadAdmissionGlobalLimit: 1,
      uploadAdmissionPerActorLimit: 1,
    });
    const lease = gate.acquire(createRequest('actor-1'));

    lease.release();
    lease.release();

    expect(() => gate.acquire(createRequest('actor-2'))).not.toThrow();
  });
});
