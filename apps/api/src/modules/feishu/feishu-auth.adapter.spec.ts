import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FEISHU_CN_OAUTH_PROVIDER } from '../../common/feishu-oauth-provider';
import { StubFeishuAuthAdapter } from './feishu-auth.adapter';

function createAdapter(overrides: Record<string, string | number> = {}) {
  const config = new Map<string, string | number>([
    ['feishuAppId', 'test-app-id'],
    ['feishuAppSecret', 'test-app-secret'],
    ['feishuRedirectUri', 'https://timeline.all-too-well.com/login/callback'],
    ['feishuAuthorizationEndpoint', FEISHU_CN_OAUTH_PROVIDER.authorizationEndpoint],
    ['feishuOauthOverallTimeoutMs', 1000],
    ['feishuOauthMaxConcurrentRequests', 2],
    ...Object.entries(overrides),
  ]);

  return new StubFeishuAuthAdapter({
    get: vi.fn((key: string) => config.get(key)),
  } as never);
}

type PromiseOutcome<T> =
  | { state: 'pending' }
  | { state: 'fulfilled'; value: T }
  | { state: 'rejected'; error: unknown };

function trackPromise<T>(promise: Promise<T>) {
  let outcome: PromiseOutcome<T> = { state: 'pending' };
  void promise.then(
    (value) => {
      outcome = { state: 'fulfilled', value };
    },
    (error: unknown) => {
      outcome = { state: 'rejected', error };
    },
  );

  return () => outcome;
}

async function flushPromiseQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function expectServiceUnavailableCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(ServiceUnavailableException);
  expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code });
}

function successfulTokenResponse() {
  return new Response(
    JSON.stringify({
      code: 0,
      access_token: 'user-access-token',
      open_id: 'ou-test',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function successfulUserInfoResponse() {
  return new Response(
    JSON.stringify({
      code: 0,
      data: {
        open_id: 'ou-test',
        name: '飞书用户',
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StubFeishuAuthAdapter Feishu CN endpoints', () => {
  it('generates the authorization URL only on the Feishu CN accounts host', async () => {
    const adapter = createAdapter();
    const url = new URL(await adapter.getAuthorizationUrl('state-value'));

    expect(url.hostname).toBe('accounts.feishu.cn');
    expect(url.pathname).toBe('/open-apis/authen/v1/index');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://timeline.all-too-well.com/login/callback',
    );
    expect(url.searchParams.get('state')).toBe('state-value');
  });

  it('exchanges code and loads user info only through open.feishu.cn', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(successfulTokenResponse())
      .mockResolvedValueOnce(successfulUserInfoResponse());
    const adapter = createAdapter();

    await expect(adapter.exchangeCodeForProfile('authorization-code')).resolves.toMatchObject({
      openId: 'ou-test',
      name: '飞书用户',
    });

    const requestedUrls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls.map((url) => url.hostname)).toEqual([
      'open.feishu.cn',
      'open.feishu.cn',
    ]);
    expect(requestedUrls.map((url) => url.pathname)).toEqual([
      '/open-apis/authen/v2/oauth/token',
      '/open-apis/authen/v1/user_info',
    ]);
    expect(requestedUrls.filter((url) => url.hostname.endsWith('larksuite.com'))).toHaveLength(0);

    const requestSignals = fetchMock.mock.calls.map(([, init]) => init?.signal);
    expect(requestSignals[0]).toBeInstanceOf(AbortSignal);
    expect(requestSignals[1]).toBe(requestSignals[0]);
    expect(requestSignals[0]?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one strict deadline across token and user-info requests', async () => {
    vi.useFakeTimers();
    const requestSignals: Array<AbortSignal | null | undefined> = [];
    const secretMarker = 'shared-budget-private-marker-271828';
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce((_url, init) => {
        requestSignals.push(init?.signal);
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(successfulTokenResponse()), 700);
        });
      })
      .mockImplementationOnce((_url, init) => {
        requestSignals.push(init?.signal);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error(secretMarker)),
            { once: true },
          );
        });
      });
    const adapter = createAdapter({ feishuOauthOverallTimeoutMs: 1000 });
    const readOutcome = trackPromise(adapter.exchangeCodeForProfile('authorization-code'));

    await vi.advanceTimersByTimeAsync(700);
    await flushPromiseQueue();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestSignals[1]).toBe(requestSignals[0]);

    await vi.advanceTimersByTimeAsync(299);
    await flushPromiseQueue();
    expect(readOutcome().state).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    await flushPromiseQueue();
    const outcome = readOutcome();
    expect(outcome.state).toBe('rejected');
    if (outcome.state === 'rejected') {
      expectServiceUnavailableCode(outcome.error, 'FEISHU_OAUTH_TIMEOUT');
    }
    expect(requestSignals[0]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(secretMarker);
    expect(warnSpy).toHaveBeenCalledWith('eventType=feishu_oauth result=timeout');
  });

  it('bounds global outbound concurrency, aborts a stuck fetch, and releases its lease', async () => {
    vi.useFakeTimers();
    const secretMarker = 'do not write this callback value to logs';
    const requestSignals: AbortSignal[] = [];
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      if (init?.signal) requestSignals.push(init.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error(secretMarker)),
          { once: true },
        );
      });
    });
    const adapter = createAdapter({
      feishuOauthOverallTimeoutMs: 1000,
      feishuOauthMaxConcurrentRequests: 1,
    });
    const firstOutcome = trackPromise(adapter.exchangeCodeForProfile('first-code'));
    await flushPromiseQueue();

    const overloadOutcome = trackPromise(adapter.exchangeCodeForProfile('second-code'));
    await flushPromiseQueue();
    const overloaded = overloadOutcome();
    expect(overloaded.state).toBe('rejected');
    if (overloaded.state === 'rejected') {
      expectServiceUnavailableCode(overloaded.error, 'FEISHU_OAUTH_OVERLOADED');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushPromiseQueue();
    const timedOut = firstOutcome();
    expect(timedOut.state).toBe('rejected');
    if (timedOut.state === 'rejected') {
      expectServiceUnavailableCode(timedOut.error, 'FEISHU_OAUTH_TIMEOUT');
    }
    expect(requestSignals).toHaveLength(1);
    expect(requestSignals[0]?.aborted).toBe(true);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(successfulTokenResponse())
      .mockResolvedValueOnce(successfulUserInfoResponse());
    await expect(adapter.exchangeCodeForProfile('third-code')).resolves.toMatchObject({
      openId: 'ou-test',
      name: '飞书用户',
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith('eventType=feishu_oauth result=overloaded');
    expect(warnSpy).toHaveBeenCalledWith('eventType=feishu_oauth result=timeout');
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(secretMarker);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('second-code');
  });

  it('cancels a chunked response as soon as it exceeds 256 KiB', async () => {
    const sensitiveChunk = 'oversized-private-marker-141421';
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(128 * 1024) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(128 * 1024) })
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sensitiveChunk) });
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: {
        getReader: () => ({ read, cancel, releaseLock }),
      },
    } as unknown as Response;
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const adapter = createAdapter();

    let caught: unknown;
    try {
      await adapter.exchangeCodeForProfile('authorization-code');
    } catch (error) {
      caught = error;
    }

    expectServiceUnavailableCode(caught, 'FEISHU_OAUTH_RESPONSE_TOO_LARGE');
    expect(read).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'eventType=feishu_oauth result=response_too_large',
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(sensitiveChunk);
  });

  it('cancels upstream HTTP error bodies and returns a fixed non-sensitive code', async () => {
    const sensitiveBody = 'private-upstream-http-body-marker-57721';
    const response = new Response(JSON.stringify({ message: sensitiveBody }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
    const cancel = vi.spyOn(response.body!, 'cancel');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const adapter = createAdapter();

    let caught: unknown;
    try {
      await adapter.exchangeCodeForProfile('authorization-code');
    } catch (error) {
      caught = error;
    }

    expectServiceUnavailableCode(caught, 'FEISHU_OAUTH_UPSTREAM_HTTP_ERROR');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'eventType=feishu_oauth result=upstream_http_error',
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(sensitiveBody);
    expect(JSON.stringify((caught as ServiceUnavailableException).getResponse())).not.toContain(
      sensitiveBody,
    );
  });

  it('does not copy upstream exception contents into application logs', async () => {
    const sensitiveError = 'synthetic-upstream-exception-marker-314159';
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(sensitiveError));
    const adapter = createAdapter();

    await expect(adapter.exchangeCodeForProfile('authorization-code')).rejects.toThrow(
      'failed to reach Feishu',
    );

    const serializedLogs = JSON.stringify(errorSpy.mock.calls);
    expect(serializedLogs).not.toContain(sensitiveError);
    expect(serializedLogs).not.toContain('private-marker-314159');
    expect(serializedLogs).not.toContain('private-cookie-marker');
  });
});
