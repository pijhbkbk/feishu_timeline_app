import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FEISHU_CN_OAUTH_PROVIDER } from '../../common/feishu-oauth-provider';
import type { FeishuAuthAdapter, FeishuIdentityProfile } from './feishu.types';

type JsonObject = Record<string, unknown>;

type FeishuOauthDeadline = {
  controller: AbortController;
  deadlineAt: number;
  timer: NodeJS.Timeout;
  timedOut: boolean;
  timeoutLogged: boolean;
};

const FEISHU_OAUTH_RESPONSE_MAX_BYTES = 256 * 1024;
const FEISHU_OAUTH_DEFAULT_OVERALL_TIMEOUT_MS = 10_000;
const FEISHU_OAUTH_MIN_OVERALL_TIMEOUT_MS = 1_000;
const FEISHU_OAUTH_MAX_OVERALL_TIMEOUT_MS = 30_000;
const FEISHU_OAUTH_DEFAULT_MAX_CONCURRENT_REQUESTS = 8;
const FEISHU_OAUTH_MAX_CONFIGURED_CONCURRENT_REQUESTS = 64;

@Injectable()
export class StubFeishuAuthAdapter implements FeishuAuthAdapter {
  private readonly logger = new Logger(StubFeishuAuthAdapter.name);
  private readonly overallTimeoutMs: number;
  private readonly maxConcurrentRequests: number;
  // This provider is a singleton, so the counter caps every OAuth exchange in this API process.
  private activeOutboundRequests = 0;

  constructor(private readonly configService: ConfigService) {
    this.overallTimeoutMs = this.readBoundedConfig(
      'feishuOauthOverallTimeoutMs',
      FEISHU_OAUTH_DEFAULT_OVERALL_TIMEOUT_MS,
      FEISHU_OAUTH_MIN_OVERALL_TIMEOUT_MS,
      FEISHU_OAUTH_MAX_OVERALL_TIMEOUT_MS,
    );
    this.maxConcurrentRequests = this.readBoundedConfig(
      'feishuOauthMaxConcurrentRequests',
      FEISHU_OAUTH_DEFAULT_MAX_CONCURRENT_REQUESTS,
      1,
      FEISHU_OAUTH_MAX_CONFIGURED_CONCURRENT_REQUESTS,
    );
  }

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
      throw new UnauthorizedException('飞书授权码不能为空。');
    }

    const clientId = this.getRequiredConfig('feishuAppId', 'Feishu app id');
    const clientSecret = this.getRequiredConfig('feishuAppSecret', 'Feishu app secret');
    const redirectUri = this.getRequiredConfig('feishuRedirectUri', 'Feishu redirect uri');
    const release = this.acquireOutboundLease();
    const deadline = this.startDeadline();

    try {
      const tokenPayload = await this.requestJson(
        FEISHU_CN_OAUTH_PROVIDER.tokenEndpoint,
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
            redirect_uri: redirectUri,
          }),
        },
        'Feishu token exchange',
        deadline,
      );
      const tokenEnvelope = this.expectFeishuSuccess(tokenPayload, 'Feishu token exchange');
      const accessToken = this.getAccessToken(tokenEnvelope);
      const tokenData = this.getTokenProfileData(tokenEnvelope);

      const userInfoPayload = await this.requestJson(
        FEISHU_CN_OAUTH_PROVIDER.userInfoEndpoint,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
        'Feishu user info request',
        deadline,
      );
      const userInfoEnvelope = this.expectFeishuSuccess(
        userInfoPayload,
        'Feishu user info request',
      );
      const userInfoData = this.asObject(
        userInfoEnvelope.data,
        'Feishu user info response data',
      );

      this.throwIfDeadlineExceeded(deadline);
      return this.toIdentityProfile(userInfoData, tokenData);
    } finally {
      clearTimeout(deadline.timer);
      release();
    }
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
    deadline: FeishuOauthDeadline,
  ): Promise<unknown> {
    let response: Response;

    this.throwIfDeadlineExceeded(deadline);
    try {
      response = await this.awaitAbortable(
        fetch(url, {
          ...init,
          signal: deadline.controller.signal,
        }),
        deadline.controller.signal,
      );
    } catch {
      if (this.hasDeadlineExpired(deadline)) {
        this.throwTimeout(deadline);
      }
      this.logger.error('eventType=feishu_oauth result=upstream_unreachable');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_UPSTREAM_UNREACHABLE',
        `${action} failed to reach Feishu.`,
      );
    }

    this.throwIfDeadlineExceeded(deadline);
    if (!response.ok) {
      this.cancelResponseBody(response);
      this.logger.warn('eventType=feishu_oauth result=upstream_http_error');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_UPSTREAM_HTTP_ERROR',
        `${action} failed with an upstream HTTP error.`,
      );
    }

    let rawBody: string;
    try {
      rawBody = await this.readBoundedResponseBody(response, deadline);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (this.hasDeadlineExpired(deadline)) {
        this.throwTimeout(deadline);
      }
      this.logger.warn('eventType=feishu_oauth result=upstream_read_error');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_UPSTREAM_READ_ERROR',
        `${action} returned an unreadable response.`,
      );
    }

    this.throwIfDeadlineExceeded(deadline);
    return this.parseJson(rawBody, action);
  }

  private parseJson(rawBody: string, action: string): unknown {
    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      this.logger.warn('eventType=feishu_oauth result=invalid_upstream_payload');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_INVALID_RESPONSE',
        `${action} returned an invalid JSON response.`,
      );
    }
  }

  private acquireOutboundLease() {
    if (this.activeOutboundRequests >= this.maxConcurrentRequests) {
      this.logger.warn('eventType=feishu_oauth result=overloaded');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_OVERLOADED',
        'Feishu OAuth is temporarily overloaded.',
      );
    }

    this.activeOutboundRequests += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.activeOutboundRequests = Math.max(0, this.activeOutboundRequests - 1);
    };
  }

  private startDeadline(): FeishuOauthDeadline {
    const controller = new AbortController();
    const deadline: FeishuOauthDeadline = {
      controller,
      deadlineAt: Date.now() + this.overallTimeoutMs,
      timer: undefined as unknown as NodeJS.Timeout,
      timedOut: false,
      timeoutLogged: false,
    };
    deadline.timer = setTimeout(() => {
      deadline.timedOut = true;
      controller.abort();
    }, this.overallTimeoutMs);
    deadline.timer.unref();

    return deadline;
  }

  private hasDeadlineExpired(deadline: FeishuOauthDeadline) {
    return (
      deadline.timedOut ||
      deadline.controller.signal.aborted ||
      Date.now() >= deadline.deadlineAt
    );
  }

  private throwIfDeadlineExceeded(deadline: FeishuOauthDeadline) {
    if (this.hasDeadlineExpired(deadline)) {
      this.throwTimeout(deadline);
    }
  }

  private throwTimeout(deadline: FeishuOauthDeadline): never {
    deadline.timedOut = true;
    if (!deadline.controller.signal.aborted) {
      deadline.controller.abort();
    }
    if (!deadline.timeoutLogged) {
      deadline.timeoutLogged = true;
      this.logger.warn('eventType=feishu_oauth result=timeout');
    }
    throw this.serviceUnavailable(
      'FEISHU_OAUTH_TIMEOUT',
      'Feishu OAuth exceeded its overall deadline.',
    );
  }

  private async readBoundedResponseBody(
    response: Response,
    deadline: FeishuOauthDeadline,
  ) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > FEISHU_OAUTH_RESPONSE_MAX_BYTES
    ) {
      this.cancelResponseBody(response);
      this.logger.warn('eventType=feishu_oauth result=response_too_large');
      throw this.serviceUnavailable(
        'FEISHU_OAUTH_RESPONSE_TOO_LARGE',
        'Feishu OAuth returned an oversized response.',
      );
    }

    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let cancelReader = false;

    try {
      while (true) {
        this.throwIfDeadlineExceeded(deadline);
        const chunk = await this.awaitAbortable(
          reader.read(),
          deadline.controller.signal,
        );
        this.throwIfDeadlineExceeded(deadline);

        if (chunk.done) break;
        totalBytes += chunk.value.byteLength;
        if (totalBytes > FEISHU_OAUTH_RESPONSE_MAX_BYTES) {
          cancelReader = true;
          this.logger.warn('eventType=feishu_oauth result=response_too_large');
          throw this.serviceUnavailable(
            'FEISHU_OAUTH_RESPONSE_TOO_LARGE',
            'Feishu OAuth returned an oversized response.',
          );
        }
        chunks.push(chunk.value);
      }
    } catch (error) {
      cancelReader = true;
      throw error;
    } finally {
      if (cancelReader) {
        try {
          void reader.cancel().catch(() => undefined);
        } catch {
          // A failed best-effort cancellation must not replace the bounded error.
        }
      }
      try {
        reader.releaseLock();
      } catch {
        // The body remains aborted/cancelled; no upstream detail is logged.
      }
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder().decode(bytes);
  }

  private cancelResponseBody(response: Response) {
    try {
      const cancellation = response.body?.cancel();
      if (cancellation) {
        void cancellation.catch(() => undefined);
      }
    } catch {
      // Cancellation is best effort and errors must not expose upstream data.
    }
  }

  private awaitAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const resolveOnce = (value: T) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onAbort = () => rejectOnce(new Error('FEISHU_OAUTH_ABORTED'));

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(resolveOnce, rejectOnce);
    });
  }

  private serviceUnavailable(code: string, message: string) {
    return new ServiceUnavailableException({ code, message });
  }

  private readBoundedConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) {
    const rawValue = this.configService.get<number | string>(key);
    const value = rawValue === undefined ? fallback : Number(rawValue);

    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
    }

    return value;
  }

  private expectFeishuSuccess(payload: unknown, action: string) {
    const envelope = this.asObject(payload, `${action} response`);
    const responseCode = envelope.code;

    if (typeof responseCode === 'number' && responseCode !== 0) {
      this.logger.warn('eventType=feishu_oauth result=upstream_rejected');
      throw new UnauthorizedException('飞书接口调用失败，请稍后重试。');
    }

    return envelope;
  }

  private getAccessToken(tokenEnvelope: JsonObject) {
    const directAccessToken = this.getOptionalString(tokenEnvelope, 'access_token');

    if (directAccessToken) {
      return directAccessToken;
    }

    if (!('data' in tokenEnvelope) || tokenEnvelope.data == null) {
      throw new ServiceUnavailableException(
        'Feishu token exchange response is missing access_token.',
      );
    }

    const tokenData = this.asObject(tokenEnvelope.data, 'Feishu token exchange response data');

    return this.getRequiredString(
      tokenData,
      'access_token',
      'Feishu token exchange response is missing access_token.',
    );
  }

  private getTokenProfileData(tokenEnvelope: JsonObject): JsonObject {
    if ('data' in tokenEnvelope && tokenEnvelope.data != null) {
      return this.asObject(tokenEnvelope.data, 'Feishu token exchange response data');
    }

    return tokenEnvelope;
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
      (typeof record.error_description === 'string' && record.error_description.trim()) ||
      (typeof record.error === 'string' && record.error.trim()) ||
      (typeof record.msg === 'string' && record.msg.trim()) ||
      (typeof record.message === 'string' && record.message.trim()) ||
      null;

    return message;
  }
}
