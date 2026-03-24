export const PUBLIC_ROUTE_KEY = 'public-route';
export const ROLE_METADATA_KEY = 'role-metadata';

export const AUTH_SOURCES = ['mock', 'feishu'] as const;

export type AuthSource = (typeof AUTH_SOURCES)[number];

export const ROLE_CODES = [
  'admin',
  'project_manager',
  'process_engineer',
  'quality_engineer',
  'purchaser',
  'reviewer',
  'finance',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '系统管理员',
  project_manager: '项目经理',
  process_engineer: '工艺工程师',
  quality_engineer: '质量工程师',
  purchaser: '采购专员',
  reviewer: '评审人',
  finance: '财务',
};

export const AUTH_SESSION_PREFIX = 'auth:session:';
