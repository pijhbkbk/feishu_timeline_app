import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import {
  DOWNLOAD_RATE_TRACKER_MAX_ACTORS,
  DownloadAdmissionRejectedException,
  DownloadAdmissionService,
} from './download-admission.service';

function createService(overrides: Record<string, number> = {}) {
  const values: Record<string, number> = {
    downloadAdmissionGlobalLimit: 4,
    downloadAdmissionPerActorLimit: 2,
    downloadAdmissionPerTargetLimit: 2,
    downloadAdmissionRateMaxRequests: 6,
    downloadAdmissionRateWindowMs: 60_000,
    ...overrides,
  };
  const configService = {
    get: vi.fn((key: string) => values[key]),
  };

  return new DownloadAdmissionService(configService as never);
}

function request(
  actorId: string,
  params: Record<string, string> = { attachmentId: 'attachment-1' },
) {
  return {
    authUser: { id: actorId },
    params,
  } as AuthenticatedRequest;
}

function expectRejected(
  callback: () => unknown,
  code: string,
) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(DownloadAdmissionRejectedException);
    expect((error as DownloadAdmissionRejectedException).getResponse()).toMatchObject({ code });
    expect((error as DownloadAdmissionRejectedException).retryAfterSeconds).toBeGreaterThan(0);
    return;
  }

  throw new Error('Expected download admission to reject.');
}

describe('DownloadAdmissionService', () => {
  it('fails closed before admission when the authenticated actor is absent', () => {
    const service = createService();
    expect(() =>
      service.acquire(
        { params: { attachmentId: 'attachment-1' } } as unknown as AuthenticatedRequest,
      ),
    ).toThrow('身份认证');
  });
  it('enforces global, actor and attachment-target concurrency with idempotent release', () => {
    const global = createService({
      downloadAdmissionGlobalLimit: 2,
      downloadAdmissionPerActorLimit: 2,
      downloadAdmissionPerTargetLimit: 2,
    });
    const globalOne = global.acquire(request('actor-1', { attachmentId: 'a-1' }));
    const globalTwo = global.acquire(request('actor-2', { attachmentId: 'a-2' }));
    expectRejected(
      () => global.acquire(request('actor-3', { attachmentId: 'a-3' })),
      'DOWNLOAD_GLOBAL_CONCURRENCY_LIMIT',
    );
    globalOne.release();
    globalOne.release();
    globalTwo.release();

    const actor = createService({ downloadAdmissionPerActorLimit: 1 });
    const actorLease = actor.acquire(request('actor-1', { attachmentId: 'a-1' }));
    expectRejected(
      () => actor.acquire(request('actor-1', { attachmentId: 'a-2' })),
      'DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
    );
    actorLease.release();

    const target = createService({ downloadAdmissionPerTargetLimit: 1 });
    const targetLease = target.acquire(request('actor-1', { attachmentId: 'shared' }));
    expectRejected(
      () => target.acquire(request('actor-2', { attachmentId: 'shared' })),
      'DOWNLOAD_PER_TARGET_CONCURRENCY_LIMIT',
    );
    targetLease.release();
  });

  it('uses attachmentId as the target even when the generic content route has no projectId', () => {
    const service = createService({ downloadAdmissionPerTargetLimit: 1 });
    const lease = service.acquire(request('actor-1', { attachmentId: 'attachment-1' }));

    expectRejected(
      () => service.acquire(request('actor-2', { attachmentId: 'attachment-1' })),
      'DOWNLOAD_PER_TARGET_CONCURRENCY_LIMIT',
    );
    lease.release();
  });

  it('enforces the actor sliding rate window and prunes expired tracker entries', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-11T00:00:00.000Z'));
      const service = createService({
        downloadAdmissionRateMaxRequests: 2,
        downloadAdmissionRateWindowMs: 1_000,
      });

      service.acquire(request('actor-1')).release();
      service.acquire(request('actor-1')).release();
      expectRejected(
        () => service.acquire(request('actor-1')),
        'DOWNLOAD_RATE_LIMIT',
      );

      vi.advanceTimersByTime(1_001);
      expect(() => service.acquire(request('actor-1')).release()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed when the bounded actor-rate tracker is full', () => {
    const service = createService();
    const tracked = (service as any).admittedAtByActor as Map<string, number[]>;
    const now = Date.now();
    for (let index = 0; index < DOWNLOAD_RATE_TRACKER_MAX_ACTORS; index += 1) {
      tracked.set(`actor-${index}`, [now]);
    }

    expectRejected(
      () => service.acquire(request('new-actor')),
      'DOWNLOAD_RATE_TRACKER_CAPACITY',
    );
  });
});
