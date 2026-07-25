export const FEISHU_CN_OAUTH_PROVIDER = {
  id: 'feishu-cn',
  authorizationEndpoint: 'https://accounts.feishu.cn/open-apis/authen/v1/index',
  tokenEndpoint: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
  userInfoEndpoint: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
  apiBaseUrl: 'https://open.feishu.cn',
} as const;

export type OAuthProvider = typeof FEISHU_CN_OAUTH_PROVIDER.id;

type FeishuOAuthRuntimeConfig = {
  oauthProvider: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  apiBaseUrl: string;
};

function assertExactEndpoint(
  configuredValue: string,
  expectedValue: string,
  configurationKey: string,
) {
  let configured: URL;
  let expected: URL;

  try {
    configured = new URL(configuredValue);
    expected = new URL(expectedValue);
  } catch {
    throw new Error(`${configurationKey} must use the approved Feishu CN endpoint.`);
  }

  if (
    configured.protocol !== 'https:' ||
    configured.username ||
    configured.password ||
    configured.search ||
    configured.hash ||
    configured.toString() !== expected.toString()
  ) {
    throw new Error(`${configurationKey} must use the approved Feishu CN endpoint.`);
  }
}

export function assertFeishuCnOAuthProvider(config: FeishuOAuthRuntimeConfig) {
  if (config.oauthProvider !== FEISHU_CN_OAUTH_PROVIDER.id) {
    throw new Error('OAUTH_PROVIDER must be feishu-cn.');
  }

  assertExactEndpoint(
    config.authorizationEndpoint,
    FEISHU_CN_OAUTH_PROVIDER.authorizationEndpoint,
    'FEISHU_AUTHORIZATION_ENDPOINT',
  );
  assertExactEndpoint(
    config.tokenEndpoint,
    FEISHU_CN_OAUTH_PROVIDER.tokenEndpoint,
    'FEISHU_TOKEN_ENDPOINT',
  );
  assertExactEndpoint(
    config.userInfoEndpoint,
    FEISHU_CN_OAUTH_PROVIDER.userInfoEndpoint,
    'FEISHU_USER_INFO_ENDPOINT',
  );
  assertExactEndpoint(
    config.apiBaseUrl,
    FEISHU_CN_OAUTH_PROVIDER.apiBaseUrl,
    'FEISHU_API_BASE_URL',
  );
}
