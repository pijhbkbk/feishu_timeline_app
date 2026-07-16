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
  'auditor',
  'viewer',
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
  auditor: '审计人员',
  viewer: '普通查看者',
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
    'review.execute',
    'attachment.manage',
    'dashboard.read',
  ],
  process_engineer: [
    'project.read',
    'workflow.transition',
    'attachment.manage',
    'dashboard.read',
  ],
  quality_engineer: [
    'project.read',
    'workflow.transition',
    'review.execute',
    'attachment.manage',
    'dashboard.read',
  ],
  purchaser: ['project.read', 'workflow.transition', 'attachment.manage', 'dashboard.read'],
  reviewer: [
    'project.read',
    'workflow.transition',
    'review.execute',
    'attachment.manage',
    'dashboard.read',
  ],
  finance: ['project.read', 'workflow.transition', 'attachment.manage', 'dashboard.read'],
  auditor: ['project.read', 'audit.read', 'dashboard.read'],
  viewer: ['project.read', 'dashboard.read'],
};

// R24 前方案 A：认证只确认用户身份，不再隐式授予管理员权限。
// 真实角色、项目范围和关键业务对象关系共同决定可执行动作。
export const AUTHENTICATED_USERS_HAVE_FULL_ACCESS = false;

export const AUTH_SESSION_PREFIX = 'auth:session:';
export const FEISHU_OAUTH_STATE_COOKIE_NAME = 'ft_feishu_oauth_state';
export const FEISHU_OAUTH_STATE_COOKIE_PATH = '/api/auth/feishu';
