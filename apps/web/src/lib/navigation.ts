import type { SessionUser, FrontendRoleCode } from './auth-client';

export type NavItem = {
  label: string;
  href: string;
  description?: string;
  requiredRoles?: FrontendRoleCode[];
  matchMode?: 'exact' | 'prefix';
};

export type ProjectSectionKey =
  | 'overview'
  | 'development-report'
  | 'workflow'
  | 'tasks'
  | 'samples'
  | 'standard-boards'
  | 'paint-procurement'
  | 'performance-tests'
  | 'pilot-production'
  | 'reviews'
  | 'fees'
  | 'production-plans'
  | 'mass-production'
  | 'color-evaluation'
  | 'color-exit'
  | 'attachments'
  | 'logs';

export type AdminSectionKey = 'users' | 'roles' | 'dicts' | 'workflow-nodes';

type RouteContext = {
  title: string;
  description: string;
  eyebrow: string;
};

type ProjectSectionMeta = {
  key: ProjectSectionKey;
  label: string;
  description: string;
  requiredRoles?: FrontendRoleCode[];
};

type AdminSectionMeta = {
  key: AdminSectionKey;
  label: string;
  description: string;
  requiredRoles?: FrontendRoleCode[];
};

export const topNavigationItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    description: '项目工作台',
  },
  {
    label: 'Projects',
    href: '/projects',
    description: '项目中心',
    matchMode: 'prefix',
  },
  {
    label: 'Colors',
    href: '/colors',
    description: '颜色与版本',
  },
  {
    label: 'Admin',
    href: '/admin/users',
    description: '系统管理',
    requiredRoles: ['admin'],
    matchMode: 'prefix',
  },
];

export const sidebarSections: Array<{
  title: string;
  items: NavItem[];
}> = [
  {
    title: 'Workspace',
    items: [
      {
        label: '工作台',
        href: '/dashboard',
        description: '查看系统导航和项目入口。',
      },
      {
        label: '我的待办',
        href: '/tasks/my',
        description: '查看当前用户分配到的活跃任务。',
      },
      {
        label: '超期任务',
        href: '/tasks/overdue',
        description: '查看当前用户已超期的任务。',
      },
      {
        label: '项目中心',
        href: '/projects',
        description: '浏览和进入项目。',
        matchMode: 'prefix',
      },
      {
        label: '新建项目',
        href: '/projects/new',
        description: '创建新的颜色开发项目。',
        requiredRoles: ['admin', 'project_manager'],
      },
      {
        label: '颜色管理',
        href: '/colors',
        description: '查看颜色与版本占位页。',
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        label: '系统管理',
        href: '/admin/users',
        description: '用户、角色、字典与流程节点。',
        requiredRoles: ['admin'],
        matchMode: 'prefix',
      },
    ],
  },
];

export const projectSectionMetaMap: Record<ProjectSectionKey, ProjectSectionMeta> = {
  overview: {
    key: 'overview',
    label: '项目概览',
    description: '项目基础信息、状态汇总和主链路摘要。',
  },
  'development-report': {
    key: 'development-report',
    label: '开发报告',
    description: '新颜色开发报告表单、提交记录和节点绑定详情。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  workflow: {
    key: 'workflow',
    label: '流程',
    description: '项目流程状态与节点推进占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'reviewer'],
  },
  tasks: {
    key: 'tasks',
    label: '任务',
    description: '项目任务池与节点任务占位。',
  },
  samples: {
    key: 'samples',
    label: '样件',
    description: '样板、样件与试制样车占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'standard-boards': {
    key: 'standard-boards',
    label: '标准板',
    description: '标准板制作与下发记录占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'paint-procurement': {
    key: 'paint-procurement',
    label: '涂料采购',
    description: '采购与供应商协同占位。',
    requiredRoles: ['admin', 'project_manager', 'purchaser'],
  },
  'performance-tests': {
    key: 'performance-tests',
    label: '性能试验',
    description: '性能测试计划、结果与状态占位。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  'pilot-production': {
    key: 'pilot-production',
    label: '试制',
    description: '首台/试制过程与结果占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  reviews: {
    key: 'reviews',
    label: '评审',
    description: '驾驶室评审、一致性评审和色差评审占位。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  fees: {
    key: 'fees',
    label: '开发费用',
    description: '费用记录与财务协同占位。',
    requiredRoles: ['admin', 'project_manager', 'finance'],
  },
  'production-plans': {
    key: 'production-plans',
    label: '生产计划',
    description: '首台计划与排产计划占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  'mass-production': {
    key: 'mass-production',
    label: '批量生产',
    description: '批产阶段状态与记录占位。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'color-evaluation': {
    key: 'color-evaluation',
    label: '颜色评价',
    description: '色差与目视评价占位。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  'color-exit': {
    key: 'color-exit',
    label: '颜色退出',
    description: '颜色退出记录、主数据状态切换与项目收尾。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  attachments: {
    key: 'attachments',
    label: '附件',
    description: '附件、图片和报告元数据占位。',
  },
  logs: {
    key: 'logs',
    label: '日志',
    description: '审计日志与项目时间线占位。',
  },
};

export const adminSectionMetaMap: Record<AdminSectionKey, AdminSectionMeta> = {
  users: {
    key: 'users',
    label: '用户管理',
    description: '用户、部门与登录身份映射占位。',
    requiredRoles: ['admin'],
  },
  roles: {
    key: 'roles',
    label: '角色权限',
    description: '系统角色与 RBAC 配置占位。',
    requiredRoles: ['admin'],
  },
  dicts: {
    key: 'dicts',
    label: '基础字典',
    description: '项目状态、下拉项和配置字典占位。',
    requiredRoles: ['admin'],
  },
  'workflow-nodes': {
    key: 'workflow-nodes',
    label: '流程节点',
    description: '节点定义与顺序配置占位。',
    requiredRoles: ['admin'],
  },
};

export function getProjectSectionItems(projectId: string): NavItem[] {
  return Object.values(projectSectionMetaMap).map((section) => ({
    label: section.label,
    href: buildProjectRoute(projectId, section.key),
    description: section.description,
    matchMode: 'prefix',
    ...(section.requiredRoles ? { requiredRoles: section.requiredRoles } : {}),
  }));
}

export function getAdminSectionItems(): NavItem[] {
  return Object.values(adminSectionMetaMap).map((section) => ({
    label: section.label,
    href: buildAdminRoute(section.key),
    description: section.description,
    ...(section.requiredRoles ? { requiredRoles: section.requiredRoles } : {}),
  }));
}

export function buildProjectRoute(projectId: string, section: ProjectSectionKey) {
  return `/projects/${projectId}/${section}`;
}

export function buildAdminRoute(section: AdminSectionKey) {
  return `/admin/${section}`;
}

export function canAccessNavItem(item: NavItem, user: SessionUser | null) {
  if (!item.requiredRoles || item.requiredRoles.length === 0) {
    return true;
  }

  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return item.requiredRoles.some((role) => user.roleCodes.includes(role));
}

export function filterNavItems(items: NavItem[], user: SessionUser | null) {
  return items.filter((item) => canAccessNavItem(item, user));
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.matchMode === 'prefix') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

export function getRouteContext(pathname: string): RouteContext {
  if (pathname === '/dashboard' || pathname === '/') {
    return {
      title: 'Dashboard',
      description: '查看当前系统骨架、核心入口和后续开发落点。',
      eyebrow: 'Workspace',
    };
  }

  if (pathname === '/projects') {
    return {
      title: '项目中心',
      description: '项目列表、筛选器和进入详情的入口将从这里展开。',
      eyebrow: 'Projects',
    };
  }

  if (pathname === '/projects/new') {
    return {
      title: '新建项目',
      description: '后续会在这里承载项目立项与基础信息表单。',
      eyebrow: 'Projects',
    };
  }

  if (pathname === '/colors') {
    return {
      title: '颜色管理',
      description: '颜色、版本和取号记录会在这里集中展示。',
      eyebrow: 'Colors',
    };
  }

  if (pathname === '/tasks/my') {
    return {
      title: '我的待办',
      description: '查看当前登录用户分配到的全部活跃工作项。',
      eyebrow: 'Tasks',
    };
  }

  if (pathname === '/tasks/pending') {
    return {
      title: '待处理任务',
      description: '查看当前登录用户尚未超期的待处理任务。',
      eyebrow: 'Tasks',
    };
  }

  if (pathname === '/tasks/overdue') {
    return {
      title: '超期任务',
      description: '查看当前登录用户已经超期的工作项。',
      eyebrow: 'Tasks',
    };
  }

  if (pathname.startsWith('/projects/')) {
    const segments = pathname.split('/').filter(Boolean);
    const projectId = segments[1];
    const sectionKey = (segments[2] ?? 'overview') as ProjectSectionKey;
    const section = projectSectionMetaMap[sectionKey];

    return {
      title: section ? section.label : '项目工作区',
      description: section
        ? `${projectId} / ${section.description}`
        : `${projectId} / 项目详情占位页。`,
      eyebrow: 'Project Workspace',
    };
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const segments = pathname.split('/').filter(Boolean);
    const sectionKey = (segments[1] ?? 'users') as AdminSectionKey;
    const section = adminSectionMetaMap[sectionKey];

    return {
      title: section ? section.label : '系统管理',
      description: section ? section.description : '系统管理占位页。',
      eyebrow: 'Administration',
    };
  }

  if (pathname.startsWith('/login')) {
    return {
      title: '登录',
      description: '飞书认证与本系统会话建立入口。',
      eyebrow: 'Authentication',
    };
  }

  return {
    title: '工作区',
    description: '当前页面已接入统一骨架，等待业务内容填充。',
    eyebrow: 'Workspace',
  };
}
