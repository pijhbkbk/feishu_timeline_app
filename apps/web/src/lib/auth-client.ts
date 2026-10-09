'use client';

export type FrontendRoleCode =
  | 'admin'
  | 'project_manager'
  | 'process_engineer'
  | 'quality_engineer'
  | 'purchaser'
  | 'production_operator'
  | 'reviewer'
  | 'finance'
  | 'auditor'
  | 'viewer';

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isSystemAdmin: boolean;
  teamAccessApproved?: boolean;
  authSource: 'local' | 'mock' | 'feishu';
  requestedJob?: string | null;
  onboardingCompleted?: boolean;
  roleCodes: FrontendRoleCode[];
  permissionCodes?: string[];
};

export function isApprovedTeamUser(user: SessionUser | null | undefined): user is SessionUser {
  return Boolean(
    user?.authSource === 'local' &&
    (user.isSystemAdmin === true || user.teamAccessApproved === true),
  );
}

export type SessionResponse = {
  authenticated: boolean;
  mockEnabled: boolean;
  feishuEnabled: boolean;
  localEnabled?: boolean;
  user: SessionUser | null;
};

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl
  ? configuredApiBaseUrl.replace(/\/$/, '')
  : '/api';

export const FRONTEND_ROLE_OPTIONS: Array<{
  code: FrontendRoleCode;
  label: string;
}> = [
  { code: 'admin', label: '系统管理员' },
  { code: 'project_manager', label: '项目协调' },
  { code: 'process_engineer', label: '工艺' },
  { code: 'quality_engineer', label: '质量试验' },
  { code: 'purchaser', label: '采购' },
  { code: 'production_operator', label: '生产' },
  { code: 'reviewer', label: '评审' },
  { code: 'finance', label: '财务' },
  { code: 'auditor', label: '审计人员' },
  { code: 'viewer', label: '普通查看者' },
];

const ENGLISH_WORD_PATTERN = /[A-Za-z]{2,}/;

export function normalizeApiErrorMessage(message: string | undefined, status?: number) {
  const rawMessage = message?.trim();

  if (!rawMessage) {
    return getStatusMessage(status);
  }

  const lowerMessage = rawMessage.toLowerCase();

  if (
    lowerMessage.includes('insufficient permissions') ||
    lowerMessage.includes('insufficient role permissions') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('permission')
  ) {
    return '无权访问该功能。';
  }

  if (
    lowerMessage.includes('authentication required') ||
    lowerMessage.includes('session expired') ||
    lowerMessage.includes('session') ||
    lowerMessage.includes('unauthorized')
  ) {
    return '请先登录后再操作。';
  }

  if (lowerMessage.includes('not found')) {
    return '请求的数据不存在或已被删除。';
  }

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('load failed')
  ) {
    return '网络连接失败，请稍后重试。';
  }

  if (lowerMessage.startsWith('request failed with')) {
    return getStatusMessage(status);
  }

  if (ENGLISH_WORD_PATTERN.test(rawMessage)) {
    return getStatusMessage(status);
  }

  return rawMessage;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;

  if (options.body !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      body:
        options.body === undefined
          ? null
          : isFormData
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch (requestError) {
    if (requestError instanceof Error && ['TimeoutError', 'AbortError'].includes(requestError.name)) {
      throw new Error('请求等待超时，请读取最新结果后重试。已填写内容仍保留。', { cause: requestError });
    }
    throw new Error(
      normalizeApiErrorMessage(
        requestError instanceof Error ? requestError.message : undefined,
      ),
      { cause: requestError },
    );
  }

  const raw = await response.text();
  let data: T | { message?: string | string[] } | null = null;

  if (raw) {
    try {
      data = JSON.parse(raw) as T | { message?: string | string[] };
    } catch {
      data = { message: raw };
    }
  }

  if (!response.ok) {
    const rawMessage =
      data && typeof data === 'object' && 'message' in data
        ? Array.isArray(data.message)
          ? data.message.join('；')
          : data.message
        : undefined;
    const message = normalizeApiErrorMessage(rawMessage, response.status);

    throw new ApiRequestError(message, response.status);
  }

  return data as T;
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiRequestError'; }
}

function getStatusMessage(status?: number) {
  switch (status) {
    case 400:
      return '请求参数不正确，请检查后重试。';
    case 401:
      return '请先登录后再操作。';
    case 403:
      return '无权访问该功能。';
    case 404:
      return '请求的数据不存在或已被删除。';
    case 409:
      return '记录已被更新，请读取最新状态后重试。';
    case 413:
      return '文件过大，请选择符合大小限制的材料。';
    case 415:
      return '不支持该文件类型，请选择合规材料。';
    case 422:
      return '材料未通过安全检查，请更换文件。';
    case 429:
      return '操作过于频繁，请稍后重试。';
    case 502:
    case 503:
      return '服务暂时不可用，请稍后重试。';
    case 504:
      return '请求超时，请检查保存结果后重试。';
    default:
      return '操作失败，请稍后重试。';
  }
}
