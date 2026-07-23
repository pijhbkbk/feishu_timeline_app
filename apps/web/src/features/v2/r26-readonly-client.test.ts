import { afterEach, describe, expect, it, vi } from 'vitest';

import { isR26ReadOnlyRealDataEnabled } from './r26-data-mode';
import { r26ReadOnlyGet } from './r26-readonly-client';

describe('R26 Gate 2 read-only client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables real data only for the explicit read-only-real mode', () => {
    expect(isR26ReadOnlyRealDataEnabled(undefined)).toBe(false);
    expect(isR26ReadOnlyRealDataEnabled('prototype')).toBe(false);
    expect(isR26ReadOnlyRealDataEnabled('read-only-real')).toBe(true);
  });

  it('always sends a GET request without a request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dataSource: 'database', readOnly: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await r26ReadOnlyGet('/v2/dashboard');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    expect(options.credentials).toBe('include');
  });

  it('rejects non-V2 paths before any network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(r26ReadOnlyGet('/projects')).rejects.toThrow(
      'R26 Gate 2 只允许访问 V2 只读接口。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
