import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { FeishuAuthAdapter, FeishuIdentityProfile } from './feishu.types';

const FEISHU_TOKEN_ENDPOINT = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const FEISHU_USER_INFO_ENDPOINT = 'https://open.feishu.cn/open-apis/authen/v1/user_info';

type JsonObject = Record<string, unknown>;

@Injectable()
export class StubFeishuAuthAdapter implements FeishuAuthAdapter {
  private readonly logger = new Logger(StubFeishuAuthAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('feishuAppId') &&
        this.configService.get<string>('feishuAppSecret') &&
        this.configService.get<string>('feishuRedirectUri') &&
        this.configService.get<string>('feishuAuthorizationEndpoint'),
    );
  }

  async getAuthorizationUrl(state: string) {
    const authorizationEndpoint = this.getRequiredConfig(
      'feishuAuthorizationEndpoint',
      'Feishu authorization endpoint',
    );
    const appId = this.getRequiredConfig('feishuAppId', 'Feishu app id');
    const redirectUri = this.getRequiredConfig('feishuRedirectUri', 'Feishu redirect uri');

    const url = new URL(authorizationEndpoint);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);

    return url.toString();
  }

  async exchangeCodeForProfile(code: string, state?: string | null): Promise<FeishuIdentityProfile> {
    void state;

    const trimmedCode = code.trim();

    if (!trimmedCode) {
      throw new UnauthorizedException('Feishu authorization code is required.');
    }

    const clientId = this.getRequiredConfig('feishuAppId', 'Feishu app id');
    const clientSecret = this.getRequiredConfig('feishuAppSecret', 'Feishu app secret');
    const tokenPayload = await this.requestJson(
      FEISHU_TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: trimmedCode,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      'Feishu token exchange',
    );
    const tokenEnvelope = this.expectFeishuSuccess(tokenPayload, 'Feishu token exchange');
    const tokenData = this.asObject(tokenEnvelope.data, 'Feishu token exchange response data');
    const accessToken = this.getRequiredString(
      tokenData,
      'access_token',
      'Feishu token exchange response is missing access_token.',
    );

    const userInfoPayload = await this.requestJson(
      FEISHU_USER_INFO_ENDPOINT,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      },
      'Feishu user info request',
    );
    const userInfoEnvelope = this.expectFeishuSuccess(userInfoPayload, 'Feishu user info request');
    const userInfoData = this.asObject(userInfoEnvelope.data, 'Feishu user info response data');

    return this.toIdentityProfile(userInfoData, tokenData);
  }

  private getRequiredConfig(key: string, label: string) {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new ServiceUnavailableException(`${label} is not configured.`);
    }

    return value;
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    action: string,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      this.logger.error(`${action} failed to reach Feishu.`, error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException(`${action} failed to reach Feishu.`);
    }

    const rawBody = await response.text();
    const payload = this.parseJson(rawBody, action);
    const errorMessage = this.extractFeishuMessage(payload);

    if (!response.ok) {
      this.logger.warn(
        `${action} returned non-2xx status ${response.status}${errorMessage ? `: ${errorMessage}` : ''}.`,
      );
      throw new ServiceUnavailableException(
        `${action} failed with status ${response.status}${errorMessage ? `: ${errorMessage}` : '.'}`,
      );
    }

    return payload;
  }

  private parseJson(rawBody: string, action: string): unknown {
    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody) as unknown;
    } catch (error) {
      this.logger.warn(
        `${action} returned a non-JSON response.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(`${action} returned an invalid JSON response.`);
    }
  }

  private expectFeishuSuccess(payload: unknown, action: string) {
    const envelope = this.asObject(payload, `${action} response`);
    const responseCode = envelope.code;

    if (typeof responseCode === 'number' && responseCode !== 0) {
      const errorMessage = this.extractFeishuMessage(envelope) ?? 'unknown upstream error';
      this.logger.warn(`${action} was rejected by Feishu with code ${responseCode}: ${errorMessage}.`);
      throw new UnauthorizedException(`${action} failed with code ${responseCode}: ${errorMessage}.`);
    }

    return envelope;
  }

  private toIdentityProfile(
    userInfoData: JsonObject,
    tokenData: JsonObject,
  ): FeishuIdentityProfile {
    const openId =
      this.getOptionalString(userInfoData, 'open_id') ??
      this.getOptionalString(tokenData, 'open_id');

    if (!openId) {
      throw new ServiceUnavailableException(
        'Feishu user info response is missing required field open_id.',
      );
    }

    const name =
      this.getOptionalString(userInfoData, 'name') ??
      this.getOptionalString(userInfoData, 'en_name') ??
      this.getOptionalString(userInfoData, 'enterprise_email') ??
      this.getOptionalString(userInfoData, 'email') ??
      this.getOptionalString(tokenData, 'open_id') ??
      this.getOptionalString(tokenData, 'user_id');

    if (!name) {
      throw new ServiceUnavailableException(
        'Feishu user info response is missing required field name.',
      );
    }

    return {
      openId,
      userId:
        this.getOptionalString(userInfoData, 'user_id') ??
        this.getOptionalString(tokenData, 'user_id') ??
        null,
      unionId:
        this.getOptionalString(userInfoData, 'union_id') ??
        this.getOptionalString(tokenData, 'union_id') ??
        null,
      name,
      email:
        this.getOptionalString(userInfoData, 'enterprise_email') ??
        this.getOptionalString(userInfoData, 'email') ??
        null,
      mobile: this.getOptionalString(userInfoData, 'mobile') ?? null,
    };
  }

  private asObject(value: unknown, label: string): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ServiceUnavailableException(`${label} is not a valid object.`);
    }

    return value as JsonObject;
  }

  private getRequiredString(record: JsonObject, key: string, errorMessage: string) {
    const value = this.getOptionalString(record, key);

    if (!value) {
      throw new ServiceUnavailableException(errorMessage);
    }

    return value;
  }

  private getOptionalString(record: JsonObject, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private extractFeishuMessage(payload: unknown) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return null;
    }

    const record = payload as JsonObject;

    const message =
      (typeof record.msg === 'string' && record.msg.trim()) ||
      (typeof record.message === 'string' && record.message.trim()) ||
      null;

    return message;
  }
}
