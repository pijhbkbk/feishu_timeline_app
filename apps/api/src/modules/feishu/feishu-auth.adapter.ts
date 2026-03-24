import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FeishuAuthAdapter, FeishuIdentityProfile } from './feishu.types';

@Injectable()
export class StubFeishuAuthAdapter implements FeishuAuthAdapter {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('feishuAppId') &&
        this.configService.get<string>('feishuRedirectUri') &&
        this.configService.get<string>('feishuAuthorizationEndpoint'),
    );
  }

  async getAuthorizationUrl(state: string) {
    const authorizationEndpoint =
      this.configService.get<string>('feishuAuthorizationEndpoint') ?? '';
    const appId = this.configService.get<string>('feishuAppId') ?? '';
    const redirectUri = this.configService.get<string>('feishuRedirectUri') ?? '';

    if (!authorizationEndpoint || !appId || !redirectUri) {
      throw new ServiceUnavailableException('Feishu authorization endpoint is not configured.');
    }

    const url = new URL(authorizationEndpoint);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);

    return url.toString();
  }

  async exchangeCodeForProfile(code: string, state?: string | null): Promise<FeishuIdentityProfile> {
    void code;
    void state;

    throw new ServiceUnavailableException(
      'Feishu auth adapter is not implemented. Replace StubFeishuAuthAdapter with a real adapter.',
    );
  }
}
