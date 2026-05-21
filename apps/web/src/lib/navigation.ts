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
  | 'flow-map'
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
  | 'materials'
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
    label: '系统导览',
    href: '/guide',
    description: '流程说明与操作指南',
  },
  {
    label: '工作台',
    href: '/dashboard',
    description: '项目进度驾驶舱',
  },
  {
    label: '项目管理',
    href: '/projects',
    description: '项目中心',
    matchMode: 'prefix',
  },
  {
    label: '流程地图',
    href: '/projects/flow-map',
    description: '项目实时流程地图',
  },
  {
    label: '工序管理',
    href: '/tasks/my',
    description: '我的待办与逾期工序',
    matchMode: 'prefix',
  },
  {
    label: '材料中心',
    href: '/materials',
    description: '材料提交与归档',
  },
  {
    label: '月度评审',
    href: '/monthly-reviews',
    description: '第 17 步月度台账',
  },
  {
    label: '数据中心',
    href: '/analytics',
    description: '项目管理分析',
  },
  {
    label: '系统设置',
    href: '/settings',
    description: '系统设置',
    matchMode: 'prefix',
  },
];

export const sidebarSections: Array<{
  title: string;
  items: NavItem[];
}> = [
  {
    title: '用户端',
    items: [
      {
        label: '系统导览',
        href: '/guide',
        description: '理解18步流程、操作步骤和角色分工。',
      },
      {
        label: '工作台',
        href: '/dashboard',
        description: '查看项目进度、逾期和评审概览。',
      },
      {
        label: '项目看板',
        href: '/projects/timeline',
        description: '横向查看所有项目的 18 个流程节点。',
      },
      {
        label: '流程地图',
        href: '/projects/flow-map',
        description: '选择项目并查看实时流程地图。',
      },
      {
        label: '项目列表',
        href: '/projects',
        description: '检索项目、筛选工序并进入详情。',
      },
      {
        label: '新建项目',
        href: '/projects/new',
        description: '创建新的颜色开发项目。',
        requiredRoles: ['admin', 'project_manager'],
      },
      {
        label: '我的待办',
        href: '/tasks/my',
        description: '查看当前用户分配到的活跃任务。',
      },
      {
        label: '逾期任务',
        href: '/tasks/overdue',
        description: '查看当前用户已逾期的任务。',
      },
      {
        label: '材料中心',
        href: '/materials',
        description: '按项目、工序和材料类型查看材料归档。',
      },
      {
        label: '月度评审',
        href: '/monthly-reviews',
        description: '查看第 17 步整车色差一致性评审台账。',
      },
      {
        label: '数据中心',
        href: '/analytics',
        description: '汇总项目进度、工序效率、返工和退出治理。',
      },
      {
        label: '系统设置',
        href: '/settings',
        description: '查看系统设置入口。',
      },
    ],
  },
  {
    title: '管理',
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
  'flow-map': {
    key: 'flow-map',
    label: '流程地图',
    description: '按业务拓扑查看项目实时进展、风险和下一步。',
  },
  'development-report': {
    key: 'development-report',
    label: '开发报告',
    description: '新颜色开发报告表单、提交记录和节点绑定详情。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  workflow: {
    key: 'workflow',
    label: '流程时间线',
    description: '项目流程状态、18 个节点时间线和流转记录。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'reviewer'],
  },
  tasks: {
    key: 'tasks',
    label: '工序清单',
    description: '项目工序任务、责任人和详情抽屉。',
  },
  samples: {
    key: 'samples',
    label: '样件',
    description: '样板、样件与试制样车管理。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'standard-boards': {
    key: 'standard-boards',
    label: '标准板',
    description: '标准板制作、下发和色板明细更新记录。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'paint-procurement': {
    key: 'paint-procurement',
    label: '涂料采购',
    description: '采购计划、供应商协同和涂料到货记录。',
    requiredRoles: ['admin', 'project_manager', 'purchaser'],
  },
  'performance-tests': {
    key: 'performance-tests',
    label: '性能试验',
    description: '性能测试计划、结果和状态跟踪。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  'pilot-production': {
    key: 'pilot-production',
    label: '试制',
    description: '首台计划、试制过程和样车结果记录。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  reviews: {
    key: 'reviews',
    label: '评审',
    description: '第 12 步驾驶室评审、第 14 步一致性评审和第 17 步月度台账。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  fees: {
    key: 'fees',
    label: '开发费用',
    description: '费用记录、固定收费规则和财务协同。',
    requiredRoles: ['admin', 'project_manager', 'finance'],
  },
  'production-plans': {
    key: 'production-plans',
    label: '生产计划',
    description: '首台计划、排产计划和后续批量生产联动。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  'mass-production': {
    key: 'mass-production',
    label: '批量生产',
    description: '批产阶段状态、产量和完成记录。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer', 'quality_engineer'],
  },
  'color-evaluation': {
    key: 'color-evaluation',
    label: '颜色评价',
    description: '色差目视评价、评审结论和退出联动。',
    requiredRoles: ['admin', 'project_manager', 'quality_engineer', 'reviewer'],
  },
  'color-exit': {
    key: 'color-exit',
    label: '颜色退出',
    description: '颜色退出记录、主数据状态切换与项目收尾。',
    requiredRoles: ['admin', 'project_manager', 'process_engineer'],
  },
  materials: {
    key: 'materials',
    label: '材料提交',
    description: '按项目、工序和材料类型管理材料与附件。',
  },
  attachments: {
    key: 'attachments',
    label: '材料 / 附件',
    description: '材料、图片和报告元数据管理。',
  },
  logs: {
    key: 'logs',
    label: '日志',
    description: '审计日志、节点动作和项目时间线。',
  },
};

export const adminSectionMetaMap: Record<AdminSectionKey, AdminSectionMeta> = {
  users: {
    key: 'users',
    label: '用户管理',
    description: '用户、部门与登录身份映射管理。',
    requiredRoles: ['admin'],
  },
  roles: {
    key: 'roles',
    label: '角色权限',
    description: '系统角色、权限和 RBAC 配置。',
    requiredRoles: ['admin'],
  },
  dicts: {
    key: 'dicts',
    label: '基础字典',
    description: '项目状态、下拉项和配置字典。',
    requiredRoles: ['admin'],
  },
  'workflow-nodes': {
    key: 'workflow-nodes',
    label: '流程节点',
    description: '节点定义、顺序和期限配置。',
    requiredRoles: ['admin'],
  },
};

const projectContextSectionKeys: ProjectSectionKey[] = [
  'overview',
  'flow-map',
  'workflow',
  'tasks',
  'materials',
  'reviews',
  'fees',
  'color-exit',
];

export function getProjectSectionItems(projectId: string): NavItem[] {
  return projectContextSectionKeys.map((sectionKey) => {
    const section = projectSectionMetaMap[sectionKey];

    return {
      label: section.label,
      href: buildProjectRoute(projectId, section.key),
      description: section.description,
      matchMode: 'prefix',
      ...(section.requiredRoles ? { requiredRoles: section.requiredRoles } : {}),
    };
  });
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
  if (item.href === '/projects' && pathname === '/projects/flow-map') {
    return false;
  }

  if (item.matchMode === 'prefix') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

export function getRouteContext(pathname: string): RouteContext {
  if (pathname === '/guide') {
    return {
      title: '系统导览',
      description: '理解轻卡定制颜色开发流程、网站操作步骤和各部门常用入口。',
      eyebrow: '新用户入口',
    };
  }

  if (pathname === '/dashboard' || pathname === '/') {
    return {
      title: '项目进度驾驶舱',
      description: '实时查看项目总览、逾期任务、本月评审和颜色退出风险。',
      eyebrow: '首页工作台',
    };
  }

  if (pathname === '/projects/timeline-board' || pathname === '/projects/timeline') {
    return {
      title: '项目时间线看板',
      description: '按项目横向展示 18 个流程节点、当前责任人、逾期状态和下一步。',
      eyebrow: '项目进度',
    };
  }

  if (pathname === '/projects/flow-map') {
    return {
      title: '项目实时流程地图',
      description: '选择项目并查看 18 个流程节点、并行支线、退回路径、风险和下一步。',
      eyebrow: '流程地图',
    };
  }

  if (pathname === '/projects') {
    return {
      title: '项目列表',
      description: '按项目、颜色、当前工序、责任部门和逾期状态检索项目。',
      eyebrow: '项目管理',
    };
  }

  if (pathname === '/projects/new') {
    return {
      title: '新建项目',
      description: '填写项目立项信息，创建后由后端初始化流程实例。',
      eyebrow: '项目中心',
    };
  }

  if (pathname === '/colors') {
    return {
      title: '颜色管理',
      description: '颜色、版本和取号记录会在这里集中展示。',
      eyebrow: '颜色管理',
    };
  }

  if (pathname === '/materials') {
    return {
      title: '材料提交平台',
      description: '按项目、工序、材料类型查看必交材料、版本和归档状态。',
      eyebrow: '材料中心',
    };
  }

  if (pathname === '/monthly-reviews') {
    return {
      title: '整车色差一致性评审台账',
      description: '集中查看第 17 步 12 个月评审进度、本月任务和逾期月份。',
      eyebrow: '月度评审',
    };
  }

  if (pathname === '/analytics') {
    return {
      title: '数据中心',
      description: '汇总项目周期、工序效率、部门责任、返工、月度评审和颜色退出治理。',
      eyebrow: '管理分析',
    };
  }

  if (pathname === '/settings') {
    return {
      title: '系统设置',
      description: '系统基础设置入口，后续承载个性化和运行配置。',
      eyebrow: '系统设置',
    };
  }

  if (pathname === '/tasks/my') {
    return {
      title: '我的待办',
      description: '查看当前登录用户分配到的全部活跃工作项。',
      eyebrow: '任务中心',
    };
  }

  if (pathname === '/tasks/pending') {
    return {
      title: '待处理任务',
      description: '查看当前登录用户尚未逾期的待处理任务。',
      eyebrow: '任务中心',
    };
  }

  if (pathname === '/tasks/overdue') {
    return {
      title: '逾期任务',
      description: '查看当前登录用户已经逾期的工作项。',
      eyebrow: '任务中心',
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
        : `${projectId} / 项目详情页。`,
      eyebrow: '项目工作区',
    };
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const segments = pathname.split('/').filter(Boolean);
    const sectionKey = (segments[1] ?? 'users') as AdminSectionKey;
    const section = adminSectionMetaMap[sectionKey];

    return {
      title: section ? section.label : '系统管理',
      description: section ? section.description : '系统管理页面。',
      eyebrow: '系统管理',
    };
  }

  if (pathname.startsWith('/login')) {
    return {
      title: '登录',
      description: '飞书认证与本系统会话建立入口。',
      eyebrow: '身份认证',
    };
  }

  return {
    title: '工作区',
    description: '当前页面已接入统一骨架，等待业务内容填充。',
    eyebrow: '工作区',
  };
}
