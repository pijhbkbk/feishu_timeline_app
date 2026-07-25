import { afterEach, describe, expect, it, vi } from 'vitest';

import { FEISHU_CN_OAUTH_PROVIDER } from '../../common/feishu-oauth-provider';
import { StubFeishuAuthAdapter } from './feishu-auth.adapter';

function createAdapter() {
  const config = new Map<string, string>([
    ['feishuAppId', 'test-app-id'],
    ['feishuAppSecret', 'test-app-secret'],
    ['feishuRedirectUri', 'https://timeline.all-too-well.com/login/callback'],
    ['feishuAuthorizationEndpoint', FEISHU_CN_OAUTH_PROVIDER.authorizationEndpoint],
  ]);

  return new StubFeishuAuthAdapter({
    get: vi.fn((key: string) => config.get(key)),
  } as never);
}

afterEach(() => {
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
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            access_token: 'user-access-token',
            open_id: 'ou-test',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
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
        ),
      );
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
  });
});
