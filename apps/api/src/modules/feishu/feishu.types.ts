export type FeishuIdentityProfile = {
  openId: string;
  userId?: string | null;
  unionId?: string | null;
  name: string;
  email?: string | null;
  mobile?: string | null;
};

export interface FeishuAuthAdapter {
  isConfigured(): boolean;
  getAuthorizationUrl(state: string): Promise<string>;
  exchangeCodeForProfile(
    code: string,
    state?: string | null,
  ): Promise<FeishuIdentityProfile>;
}
