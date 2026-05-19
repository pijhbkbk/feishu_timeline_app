'use client';

export type FrontendRoleCode =
  | 'admin'
  | 'project_manager'
  | 'process_engineer'
  | 'quality_engineer'
  | 'purchaser'
  | 'reviewer'
  | 'finance';

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isSystemAdmin: boolean;
  authSource: 'mock' | 'feishu';
  roleCodes: FrontendRoleCode[];
};

export type SessionResponse = {
  authenticated: boolean;
  mockEnabled: boolean;
  feishuEnabled: boolean;
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
  { code: 'project_manager', label: '项目经理' },
  { code: 'process_engineer', label: '工艺工程师' },
  { code: 'quality_engineer', label: '质量工程师' },
  { code: 'purchaser', label: '采购专员' },
  { code: 'reviewer', label: '评审人' },
  { code: 'finance', label: '财务' },
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
    throw new Error(
      normalizeApiErrorMessage(
        requestError instanceof Error ? requestError.message : undefined,
      ),
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

    throw new Error(message);
  }

  return data as T;
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
      return '数据状态冲突，请刷新后重试。';
    default:
      return '操作失败，请稍后重试。';
  }
}
