export const PUBLIC_ROUTE_KEY = 'public-route';
export const ROLE_METADATA_KEY = 'role-metadata';
export const PERMISSION_METADATA_KEY = 'permission-metadata';

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

export const ROLE_PERMISSION_CODE_MAP: Record<RoleCode, string[]> = {
  admin: [
    'system.manage',
    'project.read',
    'project.write',
    'workflow.transition',
    'review.execute',
    'attachment.manage',
    'audit.read',
    'dashboard.read',
  ],
  project_manager: [
    'project.read',
    'project.write',
    'workflow.transition',
    'attachment.manage',
    'dashboard.read',
  ],
  process_engineer: [
    'project.read',
    'workflow.transition',
    'attachment.manage',
    'dashboard.read',
  ],
  quality_engineer: ['project.read', 'review.execute', 'attachment.manage', 'dashboard.read'],
  purchaser: ['project.read', 'attachment.manage', 'dashboard.read'],
  reviewer: ['project.read', 'review.execute', 'attachment.manage', 'dashboard.read'],
  finance: ['project.read', 'attachment.manage', 'dashboard.read'],
};

export const AUTH_SESSION_PREFIX = 'auth:session:';
