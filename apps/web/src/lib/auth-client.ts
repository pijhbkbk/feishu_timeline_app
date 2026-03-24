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

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api';

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;

  if (options.body !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
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

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as T | { message?: string }) : null;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed with ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}
