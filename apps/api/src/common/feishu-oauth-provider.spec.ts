import { describe, expect, it } from 'vitest';

import {
  assertFeishuCnOAuthProvider,
  FEISHU_CN_OAUTH_PROVIDER,
} from './feishu-oauth-provider';

function approvedConfig() {
  return {
    oauthProvider: FEISHU_CN_OAUTH_PROVIDER.id,
    authorizationEndpoint: FEISHU_CN_OAUTH_PROVIDER.authorizationEndpoint,
    tokenEndpoint: FEISHU_CN_OAUTH_PROVIDER.tokenEndpoint,
    userInfoEndpoint: FEISHU_CN_OAUTH_PROVIDER.userInfoEndpoint,
    apiBaseUrl: FEISHU_CN_OAUTH_PROVIDER.apiBaseUrl,
  };
}

describe('Feishu CN OAuth provider', () => {
  it('accepts only the complete Feishu CN endpoint set', () => {
    expect(() => assertFeishuCnOAuthProvider(approvedConfig())).not.toThrow();
  });

  it.each([
    [
      'tokenEndpoint',
      'https://open.larksuite.com/open-apis/authen/v2/oauth/token',
      'FEISHU_TOKEN_ENDPOINT',
    ],
    [
      'userInfoEndpoint',
      'https://open.larksuite.com/open-apis/authen/v1/user_info',
      'FEISHU_USER_INFO_ENDPOINT',
    ],
    ['apiBaseUrl', 'https://open.larksuite.com', 'FEISHU_API_BASE_URL'],
  ] as const)('rejects a Lark value for %s', (key, value, configurationKey) => {
    expect(() =>
      assertFeishuCnOAuthProvider({
        ...approvedConfig(),
        [key]: value,
      }),
    ).toThrowError(`${configurationKey} must use the approved Feishu CN endpoint.`);
  });
});
