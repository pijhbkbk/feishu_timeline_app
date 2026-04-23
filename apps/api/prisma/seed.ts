import {
  ColorExitSuggestion,
  ColorBoardDetailUpdateStatus,
  ColorStatus,
  DevelopmentFeeStatus,
  DevelopmentFeeType,
  DevelopmentReportStatus,
  DistributionStatus,
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
  PerformanceTestResult,
  PerformanceTestStatus,
  PerformanceTestType,
  PrismaClient,
  ProcurementStatus,
  ProductionPlanStatus,
  ProductionPlanType,
  ProjectMemberType,
  ProjectPriority,
  ProjectStatus,
  RecurringPlanStatus,
  RecurringTaskStatus,
  ProcessTemplateStatus,
  ReviewResult,
  ReviewType,
  RoleStatus,
  SampleConfirmationDecision,
  SystemParameterValueType,
  SampleStatus,
  SampleType,
  StandardBoardStatus,
  SupplierStatus,
  TrialProductionIssueSeverity,
  TrialProductionResult,
  TrialProductionStatus,
  UserStatus,
  WorkflowAction,
  WorkflowDurationType,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  WorkCalendarDayType,
} from '@prisma/client';

const prisma = new PrismaClient();

const baseRoles = [
  {
    code: 'admin',
    name: '系统管理员',
    description: '拥有系统全局管理权限。',
  },
  {
    code: 'project_manager',
    name: '项目经理',
    description: '负责项目推进、成员协调与节点流转。',
  },
  {
    code: 'process_engineer',
    name: '工艺工程师',
    description: '负责涂料开发、工艺验证与样板推进。',
  },
  {
    code: 'quality_engineer',
    name: '质量工程师',
    description: '负责性能、质量与一致性验证。',
  },
  {
    code: 'purchaser',
    name: '采购专员',
    description: '负责涂料采购与供应商协同。',
  },
  {
    code: 'reviewer',
    name: '评审人',
    description: '负责关键节点评审。',
  },
  {
    code: 'finance',
    name: '财务',
    description: '负责费用核对与财务相关审批。',
  },
] as const;

const defaultProcessTemplate = {
  code: 'LIGHT_TRUCK_CUSTOM_COLOR_DEV',
  version: '1.0',
  name: '轻卡定制颜色开发流程',
  description: '基于三份正式业务文档冻结的轻卡定制颜色开发流程模板。',
} as const;

const rolePermissionMap = {
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
} as const;

const workflowNodes = [
  {
    stepCode: '01',
    nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '反映市场需求',
    sequence: 10,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 4,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '营销公司提交市场需求并发起颜色开发流程。',
  },
  {
    stepCode: '02',
    nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '新颜色开发报告',
    sequence: 20,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 5,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '提交新颜色开发报告。',
  },
  {
    stepCode: '03',
    nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '涂料开发',
    sequence: 30,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 5,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '完成配方与开发记录。',
  },
  {
    stepCode: '04',
    nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '样板颜色确认',
    sequence: 40,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 2,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '确认样板颜色与版本。',
  },
  {
    stepCode: '05',
    nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '新颜色取号',
    sequence: 50,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 1,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '生成或录入新颜色编号。',
  },
  {
    stepCode: '06',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '涂料采购',
    sequence: 60,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 10,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '采购开发阶段所需涂料。',
  },
  {
    stepCode: '09',
    nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '涂料性能试验',
    sequence: 70,
    durationType: WorkflowDurationType.MONTH_OFFSET,
    durationValue: 4,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '记录性能测试与结果。',
  },
  {
    stepCode: '07',
    nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '标准板制作、下发',
    sequence: 80,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 5,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '制作并下发标准板。',
  },
  {
    stepCode: '08',
    nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '色板明细更新',
    sequence: 90,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 1,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '维护色板明细信息。',
  },
  {
    stepCode: '10',
    nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '首台生产计划',
    sequence: 100,
    durationType: WorkflowDurationType.SAME_DAY,
    durationValue: 0,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '规划首台样车生产。',
  },
  {
    stepCode: '11',
    nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '样车试制',
    sequence: 110,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 3,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: true,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '记录样车试制过程与结果。',
  },
  {
    stepCode: '12',
    nodeCode: WorkflowNodeCode.CAB_REVIEW,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '样车驾驶室评审',
    sequence: 120,
    durationType: WorkflowDurationType.MANUAL_REVIEW_PASS,
    durationValue: 2,
    isBlocking: true,
    isDecisionNode: true,
    allowRework: true,
    allowManualDueAt: true,
    isReviewNode: true,
    description: '驾驶室颜色效果评审节点。',
  },
  {
    stepCode: '13',
    nodeCode: WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '颜色开发收费',
    sequence: 130,
    durationType: WorkflowDurationType.MONTH_END,
    durationValue: 0,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    defaultChargeAmount: '10000.00',
    description: '驾驶室评审通过后并行触发的开发收费节点。',
  },
  {
    stepCode: '14',
    nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '颜色一致性评审',
    sequence: 140,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 1,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: true,
    description: '一致性评审节点。',
  },
  {
    stepCode: '15',
    nodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '排产计划',
    sequence: 150,
    durationType: WorkflowDurationType.SAME_DAY,
    durationValue: 0,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '规划量产排产。',
  },
  {
    stepCode: '16',
    nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '批量生产',
    sequence: 160,
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 5,
    isBlocking: true,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: false,
    description: '进入批量生产。',
  },
  {
    stepCode: '17',
    nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '整车色差一致性评审',
    sequence: 170,
    durationType: WorkflowDurationType.RECURRING_MONTHLY,
    durationValue: 12,
    isBlocking: false,
    isDecisionNode: false,
    allowRework: false,
    allowManualDueAt: false,
    isReviewNode: true,
    description: '批量生产完成后每月执行一次的整车色差一致性评审。',
  },
  {
    stepCode: '18',
    nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
    processTemplateCode: defaultProcessTemplate.code,
    processTemplateVersion: defaultProcessTemplate.version,
    name: '颜色退出',
    sequence: 180,
    durationType: WorkflowDurationType.MONTH_OFFSET,
    durationValue: 12,
    isBlocking: false,
    isDecisionNode: true,
    allowRework: false,
    allowManualDueAt: true,
    isReviewNode: false,
    description: '12 个月周期结束后，录入年产量并给出退出建议。',
  },
] as const;

const projectStatusItems = [
  { code: ProjectStatus.DRAFT, name: '草稿', sortOrder: 10 },
  { code: ProjectStatus.IN_PROGRESS, name: '进行中', sortOrder: 20 },
  { code: ProjectStatus.ON_HOLD, name: '挂起', sortOrder: 30 },
  { code: ProjectStatus.COMPLETED, name: '已完成', sortOrder: 40 },
  { code: ProjectStatus.CANCELLED, name: '已取消', sortOrder: 50 },
] as const;

const systemParameters = [
  {
    category: 'WORKFLOW',
    code: 'DEVELOPMENT_FEE_FIXED_AMOUNT',
    valueType: SystemParameterValueType.NUMBER,
    valueNumber: '10000.00',
    description: '第 13 步颜色开发收费固定金额。',
  },
  {
    category: 'WORKFLOW',
    code: 'MONTHLY_REVIEW_TOTAL_COUNT',
    valueType: SystemParameterValueType.NUMBER,
    valueNumber: '12.00',
    description: '第 17 步月度周期实例总数。',
  },
  {
    category: 'COLOR_EXIT',
    code: 'ANNUAL_OUTPUT_EXIT_THRESHOLD',
    valueType: SystemParameterValueType.NUMBER,
    valueNumber: '20.00',
    description: '颜色退出建议默认年产量阈值。',
  },
  {
    category: 'CALENDAR',
    code: 'DEFAULT_CALENDAR_MODE',
    valueType: SystemParameterValueType.STRING,
    valueText: 'WEEKDAY_WITH_OVERRIDE',
    description: '默认工作日历模式：工作日 + 节假日覆盖。',
  },
] as const;

const demoDepartments = [
  { code: 'HQ', name: '总部', path: '/HQ', level: 1, sortOrder: 1 },
  { code: 'PMO', name: '项目管理部', path: '/HQ/PMO', level: 2, sortOrder: 10 },
  { code: 'PROCESS', name: '工艺开发部', path: '/HQ/PROCESS', level: 2, sortOrder: 20 },
  { code: 'QUALITY', name: '质量验证部', path: '/HQ/QUALITY', level: 2, sortOrder: 30 },
  { code: 'PURCHASING', name: '采购部', path: '/HQ/PURCHASING', level: 2, sortOrder: 40 },
  { code: 'FINANCE', name: '财务部', path: '/HQ/FINANCE', level: 2, sortOrder: 50 },
  { code: 'REVIEW', name: '评审委员会', path: '/HQ/REVIEW', level: 2, sortOrder: 60 },
] as const;

const demoUsers = [
  {
    key: 'admin',
    username: 'admin',
    name: '系统管理员',
    email: 'admin@example.com',
    departmentCode: 'HQ',
    isSystemAdmin: true,
    roleCodes: ['admin'],
  },
  {
    key: 'projectManager',
    username: 'mock_project_manager',
    name: '演示项目经理',
    email: 'pm.demo@example.com',
    departmentCode: 'PMO',
    isSystemAdmin: false,
    roleCodes: ['project_manager'],
  },
  {
    key: 'processEngineer',
    username: 'mock_process_engineer',
    name: '演示工艺工程师',
    email: 'process.demo@example.com',
    departmentCode: 'PROCESS',
    isSystemAdmin: false,
    roleCodes: ['process_engineer'],
  },
  {
    key: 'qualityEngineer',
    username: 'mock_quality_engineer',
    name: '演示质量工程师',
    email: 'quality.demo@example.com',
    departmentCode: 'QUALITY',
    isSystemAdmin: false,
    roleCodes: ['quality_engineer'],
  },
  {
    key: 'purchaser',
    username: 'mock_purchaser',
    name: '演示采购专员',
    email: 'purchaser.demo@example.com',
    departmentCode: 'PURCHASING',
    isSystemAdmin: false,
    roleCodes: ['purchaser'],
  },
  {
    key: 'reviewer',
    username: 'mock_reviewer',
    name: '演示评审人',
    email: 'reviewer.demo@example.com',
    departmentCode: 'REVIEW',
    isSystemAdmin: false,
    roleCodes: ['reviewer'],
  },
  {
    key: 'finance',
    username: 'mock_finance',
    name: '演示财务',
    email: 'finance.demo@example.com',
    departmentCode: 'FINANCE',
    isSystemAdmin: false,
    roleCodes: ['finance'],
  },
] as const;

const demoSuppliers = [
  {
    code: 'SUP-DEMO-001',
    name: '华东示范涂料供应商',
    contactName: '李供应',
    contactPhone: '13800001111',
  },
  {
    code: 'SUP-DEMO-002',
    name: '华南示范材料供应商',
    contactName: '陈供应',
    contactPhone: '13800002222',
  },
] as const;

const NODE_NAME_MAP = Object.fromEntries(
  workflowNodes.map((node) => [node.nodeCode, node.name]),
) as Record<WorkflowNodeCode, string>;

type SeedRefs = {
  departments: Record<string, { id: string; name: string }>;
  roles: Record<string, { id: string }>;
  users: Record<string, { id: string; name: string; departmentId: string | null }>;
  suppliers: Record<string, { id: string; supplierName: string }>;
};

function buildWorkCalendarEntries(year: number) {
  const entries: Array<{
    calendarDate: Date;
    dayType: WorkCalendarDayType;
    isWorkday: boolean;
    note: string;
  }> = [];

  for (let month = 0; month < 12; month += 1) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const calendarDate = new Date(Date.UTC(year, month, day));
      const weekDay = calendarDate.getUTCDay();
      const isWeekend = weekDay === 0 || weekDay === 6;
      entries.push({
        calendarDate,
        dayType: isWeekend ? WorkCalendarDayType.WEEKEND : WorkCalendarDayType.WORKDAY,
        isWorkday: !isWeekend,
        note: isWeekend ? '默认周末' : '默认工作日',
      });
    }
  }

  return entries;
}

function getNodeName(nodeCode: WorkflowNodeCode) {
  return NODE_NAME_MAP[nodeCode];
}

async function upsertBaseData(): Promise<SeedRefs> {
  return prisma.$transaction(async (tx) => {
    const departments: SeedRefs['departments'] = {};
    const roles: SeedRefs['roles'] = {};
    const users: SeedRefs['users'] = {};
    const suppliers: SeedRefs['suppliers'] = {};

    await tx.processTemplate.upsert({
      where: {
        code_version: {
          code: defaultProcessTemplate.code,
          version: defaultProcessTemplate.version,
        },
      },
      create: {
        code: defaultProcessTemplate.code,
        version: defaultProcessTemplate.version,
        name: defaultProcessTemplate.name,
        description: defaultProcessTemplate.description,
        status: ProcessTemplateStatus.ACTIVE,
        isDefault: true,
      },
      update: {
        name: defaultProcessTemplate.name,
        description: defaultProcessTemplate.description,
        status: ProcessTemplateStatus.ACTIVE,
        isDefault: true,
      },
    });

    for (const department of demoDepartments) {
      const parentCode = department.path.split('/').filter(Boolean).slice(-2, -1)[0] ?? null;
      const parentId = parentCode ? departments[parentCode]?.id ?? null : null;
      const record = await tx.department.upsert({
        where: { code: department.code },
        create: {
          code: department.code,
          name: department.name,
          path: department.path,
          level: department.level,
          sortOrder: department.sortOrder,
          isActive: true,
          parentId,
        },
        update: {
          name: department.name,
          path: department.path,
          level: department.level,
          sortOrder: department.sortOrder,
          isActive: true,
          parentId,
        },
      });
      departments[department.code] = {
        id: record.id,
        name: record.name,
      };
    }

    for (const role of baseRoles) {
      const record = await tx.role.upsert({
        where: { code: role.code },
        create: {
          ...role,
          status: RoleStatus.ACTIVE,
          isSystem: true,
        },
        update: {
          name: role.name,
          description: role.description,
          status: RoleStatus.ACTIVE,
          isSystem: true,
        },
      });
      roles[role.code] = { id: record.id };
    }

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissionMap)) {
      const roleId = roles[roleCode]?.id;
      if (!roleId) {
        continue;
      }

      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      await tx.rolePermission.createMany({
        data: permissionCodes.map((permissionCode) => ({
          roleId,
          permissionCode,
        })),
      });
    }

    for (const user of demoUsers) {
      const departmentId = departments[user.departmentCode]?.id ?? null;
      const record = await tx.user.upsert({
        where: { username: user.username },
        create: {
          username: user.username,
          name: user.name,
          email: user.email,
          departmentId,
          status: UserStatus.ACTIVE,
          isSystemAdmin: user.isSystemAdmin,
        },
        update: {
          name: user.name,
          email: user.email,
          departmentId,
          status: UserStatus.ACTIVE,
          isSystemAdmin: user.isSystemAdmin,
        },
      });

      await tx.userRole.deleteMany({
        where: { userId: record.id },
      });

      await tx.userRole.createMany({
        data: user.roleCodes.map((roleCode) => ({
          userId: record.id,
          roleId: roles[roleCode]?.id,
        })),
      });

      users[user.key] = {
        id: record.id,
        name: record.name,
        departmentId: record.departmentId,
      };
    }

    for (const node of workflowNodes) {
      await tx.workflowNodeDefinition.upsert({
        where: { nodeCode: node.nodeCode },
        create: node,
        update: {
          stepCode: node.stepCode,
          processTemplateCode: node.processTemplateCode,
          processTemplateVersion: node.processTemplateVersion,
          name: node.name,
          sequence: node.sequence,
          durationType: node.durationType,
          durationValue: node.durationValue,
          isBlocking: node.isBlocking,
          isDecisionNode: node.isDecisionNode,
          allowRework: node.allowRework,
          allowManualDueAt: node.allowManualDueAt,
          isReviewNode: node.isReviewNode,
          isActive: true,
          defaultChargeAmount: node.defaultChargeAmount ?? null,
          description: node.description,
        },
      });
    }

    for (const status of projectStatusItems) {
      await tx.systemEnumItem.upsert({
        where: {
          category_code: {
            category: 'PROJECT_STATUS',
            code: status.code,
          },
        },
        create: {
          category: 'PROJECT_STATUS',
          code: status.code,
          name: status.name,
          sortOrder: status.sortOrder,
          isActive: true,
        },
        update: {
          name: status.name,
          sortOrder: status.sortOrder,
          isActive: true,
        },
      });
    }

    for (const parameter of systemParameters) {
      await tx.systemParameter.upsert({
        where: {
          category_code: {
            category: parameter.category,
            code: parameter.code,
          },
        },
        create: {
          category: parameter.category,
          code: parameter.code,
          valueType: parameter.valueType,
          valueText: parameter.valueText ?? null,
          valueNumber: parameter.valueNumber ?? null,
          description: parameter.description,
          isActive: true,
        },
        update: {
          valueType: parameter.valueType,
          valueText: parameter.valueText ?? null,
          valueNumber: parameter.valueNumber ?? null,
          description: parameter.description,
          isActive: true,
        },
      });
    }

    for (const year of [2026, 2027]) {
      const entries = buildWorkCalendarEntries(year);
      const firstDate = entries[0]?.calendarDate;
      const lastDate = entries[entries.length - 1]?.calendarDate;

      if (!firstDate || !lastDate) {
        continue;
      }

      await tx.workCalendar.deleteMany({
        where: {
          calendarDate: {
            gte: firstDate,
            lte: lastDate,
          },
        },
      });

      await tx.workCalendar.createMany({
        data: entries,
      });
    }

    for (const supplier of demoSuppliers) {
      const record = await tx.supplier.upsert({
        where: { supplierCode: supplier.code },
        create: {
          supplierCode: supplier.code,
          supplierName: supplier.name,
          contactName: supplier.contactName,
          contactPhone: supplier.contactPhone,
          status: SupplierStatus.ACTIVE,
        },
        update: {
          supplierName: supplier.name,
          contactName: supplier.contactName,
          contactPhone: supplier.contactPhone,
          status: SupplierStatus.ACTIVE,
        },
      });
      suppliers[supplier.code] = {
        id: record.id,
        supplierName: record.supplierName,
      };
    }

    return {
      departments,
      roles,
      users,
      suppliers,
    };
  });
}

async function createWorkflowTask(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    workflowInstanceId: string;
    projectId: string;
    taskNo: string;
    nodeCode: WorkflowNodeCode;
    status: WorkflowTaskStatus;
    isPrimary?: boolean;
    isActive?: boolean;
    assigneeUserId?: string | null;
    dueAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    returnedAt?: Date | null;
  },
) {
  return tx.workflowTask.create({
    data: {
      workflowInstanceId: input.workflowInstanceId,
      projectId: input.projectId,
      taskNo: input.taskNo,
      nodeCode: input.nodeCode,
      nodeName: getNodeName(input.nodeCode),
      taskRound: 1,
      status: input.status,
      isPrimary: input.isPrimary ?? true,
      isActive: input.isActive ?? false,
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: input.dueAt ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
      returnedAt: input.returnedAt ?? null,
      payload: {
        seeded: true,
      },
    },
  });
}

async function createWorkflowTransition(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    workflowInstanceId: string;
    projectId: string;
    fromTaskId?: string | null;
    toTaskId?: string | null;
    fromNodeCode?: WorkflowNodeCode | null;
    toNodeCode?: WorkflowNodeCode | null;
    action: WorkflowAction;
    comment: string;
    operatorUserId?: string | null;
    createdAt: Date;
  },
) {
  return tx.workflowTransition.create({
    data: {
      workflowInstanceId: input.workflowInstanceId,
      projectId: input.projectId,
      fromTaskId: input.fromTaskId ?? null,
      toTaskId: input.toTaskId ?? null,
      fromNodeCode: input.fromNodeCode ?? null,
      toNodeCode: input.toNodeCode ?? null,
      action: input.action,
      comment: input.comment,
      operatorUserId: input.operatorUserId ?? null,
      createdAt: input.createdAt,
    },
  });
}

async function ensureProjectMembers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  projectId: string,
  refs: SeedRefs,
) {
  await tx.projectMember.createMany({
    data: [
      {
        projectId,
        userId: refs.users.projectManager.id,
        memberType: ProjectMemberType.OWNER,
        title: '项目负责人',
        isPrimary: true,
      },
      {
        projectId,
        userId: refs.users.projectManager.id,
        memberType: ProjectMemberType.MANAGER,
        title: '项目经理',
        isPrimary: false,
      },
      {
        projectId,
        userId: refs.users.processEngineer.id,
        memberType: ProjectMemberType.MEMBER,
        title: '工艺负责人',
        isPrimary: false,
      },
      {
        projectId,
        userId: refs.users.qualityEngineer.id,
        memberType: ProjectMemberType.MEMBER,
        title: '质量负责人',
        isPrimary: false,
      },
      {
        projectId,
        userId: refs.users.purchaser.id,
        memberType: ProjectMemberType.MEMBER,
        title: '采购负责人',
        isPrimary: false,
      },
      {
        projectId,
        userId: refs.users.reviewer.id,
        memberType: ProjectMemberType.REVIEWER,
        title: '评审负责人',
        isPrimary: false,
      },
      {
        projectId,
        userId: refs.users.finance.id,
        memberType: ProjectMemberType.OBSERVER,
        title: '财务观察者',
        isPrimary: false,
      },
    ],
  });
}

async function ensureActiveDemoProject(refs: SeedRefs) {
  const existing = await prisma.project.findUnique({
    where: { code: 'DEMO-ACTIVE-001' },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const plannedStartDate = new Date('2026-03-01T00:00:00.000Z');
    const plannedEndDate = new Date('2026-04-15T00:00:00.000Z');
    const overdueDueAt = new Date('2026-03-18T00:00:00.000Z');

    const project = await tx.project.create({
      data: {
        code: 'DEMO-ACTIVE-001',
        name: '轻卡新颜色开发演示项目（进行中）',
        description: '用于联调 Dashboard、待办、流程流转、日志与通知的进行中样例。',
        status: ProjectStatus.IN_PROGRESS,
        priority: ProjectPriority.HIGH,
        currentNodeCode: WorkflowNodeCode.CAB_REVIEW,
        owningDepartmentId: refs.departments.PMO.id,
        ownerUserId: refs.users.projectManager.id,
        marketRegion: '华东',
        vehicleModel: '轻卡 X1',
        plannedStartDate,
        plannedEndDate,
        actualStartDate: new Date('2026-03-02T00:00:00.000Z'),
      },
    });

    await ensureProjectMembers(tx, project.id, refs);

    const color = await tx.color.create({
      data: {
        projectId: project.id,
        code: 'CLR-DEMO-A-001',
        name: '星云蓝',
        description: '进行中演示颜色主数据。',
        status: ColorStatus.APPROVED,
        isPrimary: true,
      },
    });

    const workflowInstance = await tx.workflowInstance.create({
      data: {
        projectId: project.id,
        instanceNo: 'WF-DEMO-ACTIVE-001',
        versionNo: 1,
        templateCode: 'COLOR_DEVELOPMENT_MVP',
        status: WorkflowInstanceStatus.RUNNING,
        currentNodeCode: WorkflowNodeCode.CAB_REVIEW,
        initiatedById: refs.users.projectManager.id,
        startedAt: new Date('2026-03-02T00:00:00.000Z'),
      },
    });

    const tasks = {
      initiation: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-010',
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.projectManager.id,
        completedAt: new Date('2026-03-02T01:00:00.000Z'),
      }),
      developmentReport: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-020',
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-03T01:00:00.000Z'),
      }),
      paintDevelopment: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-030',
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-05T01:00:00.000Z'),
      }),
      sampleConfirm: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-040',
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        status: WorkflowTaskStatus.APPROVED,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-03-08T01:00:00.000Z'),
      }),
      colorNumbering: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-050',
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-08T03:00:00.000Z'),
      }),
      paintProcurement: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-060',
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.purchaser.id,
        completedAt: new Date('2026-03-10T01:00:00.000Z'),
      }),
      performanceTest: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-070',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-03-12T01:00:00.000Z'),
      }),
      standardBoard: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-080',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-12T02:00:00.000Z'),
      }),
      boardDetail: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-090',
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-03-12T04:00:00.000Z'),
      }),
      firstProductionPlan: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-100',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-14T01:00:00.000Z'),
      }),
      trialProduction: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-110',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-03-16T01:00:00.000Z'),
      }),
      cabinReview: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-ACTIVE-TASK-120',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        status: WorkflowTaskStatus.READY,
        isActive: true,
        assigneeUserId: refs.users.reviewer.id,
        dueAt: overdueDueAt,
      }),
    };

    await tx.developmentReport.create({
      data: {
        projectId: project.id,
        workflowInstanceId: workflowInstance.id,
        workflowTaskId: tasks.developmentReport.id,
        status: DevelopmentReportStatus.SUBMITTED,
        reportTitle: '星云蓝新颜色开发报告',
        demandSource: '市场需求',
        targetMarket: '华东',
        targetVehicleModel: '轻卡 X1',
        targetColorName: color.name,
        developmentReason: '配合年度新品配色规划与区域市场定制需求。',
        expectedLaunchDate: new Date('2026-06-01T00:00:00.000Z'),
        estimatedAnnualVolume: 1200,
        technicalRequirements: '需适配现有烘烤工艺。',
        qualityRequirements: '需满足盐雾与附着力基准。',
        riskSummary: '当前处于驾驶室评审前夜，需重点关注驾驶室综合色差。',
        remark: 'seed demo',
        createdById: refs.users.processEngineer.id,
        updatedById: refs.users.processEngineer.id,
        submittedById: refs.users.processEngineer.id,
        submittedAt: new Date('2026-03-03T01:00:00.000Z'),
      },
    });

    const sample = await tx.sample.create({
      data: {
        projectId: project.id,
        colorId: color.id,
        sampleNo: 'SMP-DEMO-A-001',
        sampleName: '星云蓝样板',
        versionNo: 1,
        isCurrent: true,
        sampleType: SampleType.PANEL,
        status: SampleStatus.CONFIRMED,
        location: '实验室样板柜 A-01',
        remark: '样板确认通过。',
        producedAt: new Date('2026-03-06T00:00:00.000Z'),
        confirmedAt: new Date('2026-03-08T00:00:00.000Z'),
      },
    });

    await tx.sampleConfirmation.create({
      data: {
        projectId: project.id,
        sampleId: sample.id,
        workflowInstanceId: workflowInstance.id,
        workflowTaskId: tasks.sampleConfirm.id,
        decision: SampleConfirmationDecision.APPROVE,
        colorAssessment: '样板综合色相符合预期。',
        appearanceAssessment: '光泽和纹理满足基准。',
        comment: '样板确认通过并触发后续并行节点。',
        confirmedById: refs.users.qualityEngineer.id,
        confirmedAt: new Date('2026-03-08T00:00:00.000Z'),
      },
    });

    const procurement = await tx.paintProcurement.create({
      data: {
        projectId: project.id,
        supplierId: refs.suppliers['SUP-DEMO-001'].id,
        colorId: color.id,
        procurementCode: 'PO-DEMO-A-001',
        materialName: '星云蓝开发涂料',
        batchNo: 'BATCH-A-001',
        quantity: '120.000',
        unit: 'kg',
        status: ProcurementStatus.ARRIVED,
        requestedById: refs.users.purchaser.id,
        orderedAt: new Date('2026-03-09T00:00:00.000Z'),
        arrivalDate: new Date('2026-03-10T00:00:00.000Z'),
        note: '用于试制与性能验证。',
      },
    });

    await tx.performanceTest.create({
      data: {
        projectId: project.id,
        sampleId: sample.id,
        paintProcurementId: procurement.id,
        testedById: refs.users.qualityEngineer.id,
        testCode: 'PT-DEMO-A-001',
        relatedObjectName: sample.sampleName,
        testItem: PerformanceTestType.ADHESION,
        status: PerformanceTestStatus.SUBMITTED,
        standardValue: '0 级',
        actualValue: '0 级',
        result: PerformanceTestResult.PASS,
        conclusion: '附着力满足要求。',
        testedAt: new Date('2026-03-11T00:00:00.000Z'),
        submittedAt: new Date('2026-03-12T00:00:00.000Z'),
      },
    });

    const standardBoard = await tx.standardBoard.create({
      data: {
        projectId: project.id,
        basedOnSampleId: sample.id,
        issuedById: refs.users.processEngineer.id,
        colorId: color.id,
        boardCode: 'SB-DEMO-A-001',
        versionNo: 1,
        status: StandardBoardStatus.ISSUED,
        isCurrent: true,
        producedAt: new Date('2026-03-11T00:00:00.000Z'),
        issuedAt: new Date('2026-03-12T00:00:00.000Z'),
        recipientName: '演示质量工程师',
        recipientDept: '质量验证部',
        remark: '当前有效标准板。',
      },
    });

    await tx.boardDistributionRecord.create({
      data: {
        projectId: project.id,
        standardBoardId: standardBoard.id,
        receiverName: '演示质量工程师',
        receiverDept: '质量验证部',
        recipientDepartmentId: refs.departments.QUALITY.id,
        recipientUserId: refs.users.qualityEngineer.id,
        quantity: 1,
        status: DistributionStatus.RECEIVED,
        sentAt: new Date('2026-03-12T00:00:00.000Z'),
        signedAt: new Date('2026-03-12T08:00:00.000Z'),
        note: '用于性能对标。',
      },
    });

    await tx.colorBoardDetailUpdate.create({
      data: {
        projectId: project.id,
        standardBoardId: standardBoard.id,
        updatedById: refs.users.qualityEngineer.id,
        updateStatus: ColorBoardDetailUpdateStatus.UPDATED,
        detailUpdatedAt: new Date('2026-03-12T10:00:00.000Z'),
        note: '色板明细已同步。',
      },
    });

    const firstPlan = await tx.productionPlan.create({
      data: {
        projectId: project.id,
        createdById: refs.users.processEngineer.id,
        ownerId: refs.users.processEngineer.id,
        confirmedById: refs.users.projectManager.id,
        planNo: 'FP-DEMO-A-001',
        planType: ProductionPlanType.FIRST_UNIT,
        status: ProductionPlanStatus.CONFIRMED,
        quantity: 1,
        actualQuantity: 1,
        planDate: new Date('2026-03-13T00:00:00.000Z'),
        lineName: '涂装线 A',
        workshop: '总装一车间',
        batchNo: 'FP-BATCH-A',
        confirmedAt: new Date('2026-03-13T08:00:00.000Z'),
        actualStartAt: new Date('2026-03-14T00:00:00.000Z'),
        actualEndAt: new Date('2026-03-14T08:00:00.000Z'),
        remark: '首台计划已确认。',
      },
    });

    const trialProduction = await tx.trialProduction.create({
      data: {
        projectId: project.id,
        productionPlanId: firstPlan.id,
        colorId: color.id,
        trialNo: 'TRIAL-DEMO-A-001',
        status: TrialProductionStatus.PASSED,
        quantity: 1,
        paintBatchNo: procurement.batchNo,
        result: TrialProductionResult.PASS,
        note: '驾驶室评审待处理。',
        location: '总装一车间',
        plannedAt: new Date('2026-03-15T00:00:00.000Z'),
        startedAt: new Date('2026-03-15T02:00:00.000Z'),
        completedAt: new Date('2026-03-16T00:00:00.000Z'),
        summary: '样车试制完成，等待驾驶室评审。',
      },
    });

    await tx.trialProductionIssue.create({
      data: {
        trialProductionId: trialProduction.id,
        issueType: 'SPRAY_FINISH',
        description: '局部边角存在轻微喷涂一致性波动。',
        severity: TrialProductionIssueSeverity.MEDIUM,
        responsibleDept: '工艺开发部',
      },
    });

    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      toTaskId: tasks.initiation.id,
      toNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      action: WorkflowAction.SYSTEM_SYNC,
      comment: '项目创建后自动初始化流程。',
      operatorUserId: refs.users.projectManager.id,
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.initiation.id,
      toTaskId: tasks.developmentReport.id,
      fromNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      toNodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
      action: WorkflowAction.COMPLETE,
      comment: '项目立项完成后进入开发报告。',
      operatorUserId: refs.users.projectManager.id,
      createdAt: new Date('2026-03-02T01:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.developmentReport.id,
      toTaskId: tasks.paintDevelopment.id,
      fromNodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
      toNodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
      action: WorkflowAction.SUBMIT,
      comment: '开发报告提交后进入涂料开发。',
      operatorUserId: refs.users.processEngineer.id,
      createdAt: new Date('2026-03-03T01:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.paintDevelopment.id,
      toTaskId: tasks.sampleConfirm.id,
      fromNodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
      toNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      action: WorkflowAction.COMPLETE,
      comment: '涂料开发完成后进入样板确认。',
      operatorUserId: refs.users.processEngineer.id,
      createdAt: new Date('2026-03-05T01:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.sampleConfirm.id,
      toTaskId: tasks.paintProcurement.id,
      fromNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      toNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      action: WorkflowAction.APPROVE,
      comment: '样板确认通过后进入采购主线。',
      operatorUserId: refs.users.qualityEngineer.id,
      createdAt: new Date('2026-03-08T00:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.sampleConfirm.id,
      toTaskId: tasks.colorNumbering.id,
      fromNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      toNodeCode: WorkflowNodeCode.COLOR_NUMBERING,
      action: WorkflowAction.APPROVE,
      comment: '样板确认通过后并行创建新颜色取号。',
      operatorUserId: refs.users.qualityEngineer.id,
      createdAt: new Date('2026-03-08T00:05:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.paintProcurement.id,
      toTaskId: tasks.firstProductionPlan.id,
      fromNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      toNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      action: WorkflowAction.COMPLETE,
      comment: '采购完成后进入首台计划。',
      operatorUserId: refs.users.purchaser.id,
      createdAt: new Date('2026-03-10T01:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.paintProcurement.id,
      toTaskId: tasks.performanceTest.id,
      fromNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      toNodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
      action: WorkflowAction.COMPLETE,
      comment: '采购完成后并行创建性能试验。',
      operatorUserId: refs.users.purchaser.id,
      createdAt: new Date('2026-03-10T01:01:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.paintProcurement.id,
      toTaskId: tasks.standardBoard.id,
      fromNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      toNodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      action: WorkflowAction.COMPLETE,
      comment: '采购完成后并行创建标准板制作。',
      operatorUserId: refs.users.purchaser.id,
      createdAt: new Date('2026-03-10T01:02:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.standardBoard.id,
      toTaskId: tasks.boardDetail.id,
      fromNodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      toNodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      action: WorkflowAction.COMPLETE,
      comment: '标准板完成后自动进入色板明细更新。',
      operatorUserId: refs.users.processEngineer.id,
      createdAt: new Date('2026-03-12T04:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.firstProductionPlan.id,
      toTaskId: tasks.trialProduction.id,
      fromNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      toNodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
      action: WorkflowAction.COMPLETE,
      comment: '首台计划完成后进入样车试制。',
      operatorUserId: refs.users.processEngineer.id,
      createdAt: new Date('2026-03-14T01:00:00.000Z'),
    });
    await createWorkflowTransition(tx, {
      workflowInstanceId: workflowInstance.id,
      projectId: project.id,
      fromTaskId: tasks.trialProduction.id,
      toTaskId: tasks.cabinReview.id,
      fromNodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
      toNodeCode: WorkflowNodeCode.CAB_REVIEW,
      action: WorkflowAction.COMPLETE,
      comment: '样车试制完成后进入驾驶室评审。',
      operatorUserId: refs.users.processEngineer.id,
      createdAt: new Date('2026-03-16T01:00:00.000Z'),
    });

    await tx.auditLog.createMany({
      data: [
        {
          projectId: project.id,
          actorUserId: refs.users.projectManager.id,
          targetType: 'PROJECT',
          targetId: project.id,
          action: 'PROJECT_CREATED',
          nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
          summary: `创建项目 ${project.name}`,
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        },
        {
          projectId: project.id,
          actorUserId: refs.users.qualityEngineer.id,
          targetType: 'SAMPLE',
          targetId: sample.id,
          action: 'SAMPLE_CONFIRM_APPROVED',
          nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
          summary: '样板颜色确认通过。',
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
        },
        {
          projectId: project.id,
          actorUserId: refs.users.purchaser.id,
          targetType: 'PAINT_PROCUREMENT',
          targetId: procurement.id,
          action: 'PROCUREMENT_COMPLETED',
          nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
          summary: '采购节点完成并激活并行验证。',
          createdAt: new Date('2026-03-10T01:00:00.000Z'),
        },
      ],
    });

    await tx.notification.create({
      data: {
        userId: refs.users.reviewer.id,
        projectId: project.id,
        taskId: tasks.cabinReview.id,
        notificationType: NotificationType.REVIEW_PENDING,
        title: `${project.name} 待处理驾驶室评审`,
        content: '样车试制已完成，请尽快处理驾驶室评审任务。',
        linkPath: `/projects/${project.id}/reviews`,
        dedupeKey: 'seed:demo-active:cabin-review',
        isRead: false,
        sendChannel: NotificationSendChannel.IN_APP,
        sendStatus: NotificationSendStatus.SENT,
      },
    });
  });
}

async function ensureCompletedDemoProject(refs: SeedRefs) {
  const existing = await prisma.project.findUnique({
    where: { code: 'DEMO-COMPLETE-001' },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const plannedStartDate = new Date('2026-01-05T00:00:00.000Z');
    const plannedEndDate = new Date('2027-02-28T00:00:00.000Z');
    const actualEndDate = new Date('2027-02-26T00:00:00.000Z');

    const project = await tx.project.create({
      data: {
        code: 'DEMO-COMPLETE-001',
        name: '轻卡新颜色开发演示项目（已完成）',
        description: '用于验收主流程闭环、颜色退出和项目收尾的完成样例。',
        status: ProjectStatus.COMPLETED,
        priority: ProjectPriority.MEDIUM,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        owningDepartmentId: refs.departments.PMO.id,
        ownerUserId: refs.users.projectManager.id,
        marketRegion: '华南',
        vehicleModel: '轻卡 Z9',
        plannedStartDate,
        plannedEndDate,
        actualStartDate: new Date('2026-01-06T00:00:00.000Z'),
        actualEndDate,
        closedAt: actualEndDate,
      },
    });

    await ensureProjectMembers(tx, project.id, refs);

    const color = await tx.color.create({
      data: {
        projectId: project.id,
        code: 'CLR-DEMO-C-001',
        name: '极昼银',
        description: '已完成并退出的演示颜色。',
        status: ColorStatus.EXITED,
        isPrimary: true,
        exitFlag: true,
        exitDate: actualEndDate,
      },
    });

    const workflowInstance = await tx.workflowInstance.create({
      data: {
        projectId: project.id,
        instanceNo: 'WF-DEMO-COMPLETE-001',
        versionNo: 1,
        templateCode: 'COLOR_DEVELOPMENT_MVP',
        status: WorkflowInstanceStatus.COMPLETED,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        initiatedById: refs.users.projectManager.id,
        startedAt: new Date('2026-01-06T00:00:00.000Z'),
        completedAt: actualEndDate,
      },
    });

    const tasks = {
      initiation: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-010',
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.projectManager.id,
        completedAt: new Date('2026-01-06T01:00:00.000Z'),
      }),
      developmentReport: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-020',
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-08T01:00:00.000Z'),
      }),
      paintDevelopment: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-030',
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-12T01:00:00.000Z'),
      }),
      sampleConfirm: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-040',
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        status: WorkflowTaskStatus.APPROVED,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-01-14T01:00:00.000Z'),
      }),
      colorNumbering: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-050',
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-14T03:00:00.000Z'),
      }),
      paintProcurement: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-060',
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.purchaser.id,
        completedAt: new Date('2026-01-18T01:00:00.000Z'),
      }),
      performanceTest: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-070',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-01-20T01:00:00.000Z'),
      }),
      standardBoard: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-080',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-20T02:00:00.000Z'),
      }),
      boardDetail: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-090',
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.qualityEngineer.id,
        completedAt: new Date('2026-01-20T04:00:00.000Z'),
      }),
      firstProductionPlan: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-100',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-23T01:00:00.000Z'),
      }),
      trialProduction: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-110',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-01-25T01:00:00.000Z'),
      }),
      cabinReview: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-120',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        status: WorkflowTaskStatus.APPROVED,
        assigneeUserId: refs.users.reviewer.id,
        completedAt: new Date('2026-01-28T01:00:00.000Z'),
      }),
      developmentFee: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-130',
        nodeCode: WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
        status: WorkflowTaskStatus.COMPLETED,
        isPrimary: false,
        assigneeUserId: refs.users.finance.id,
        completedAt: new Date('2026-01-30T01:00:00.000Z'),
      }),
      consistencyReview: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-140',
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        status: WorkflowTaskStatus.APPROVED,
        assigneeUserId: refs.users.reviewer.id,
        completedAt: new Date('2026-02-02T01:00:00.000Z'),
      }),
      schedulePlan: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-150',
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-02-06T01:00:00.000Z'),
      }),
      massProduction: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-160',
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: new Date('2026-02-16T01:00:00.000Z'),
      }),
      visualReview: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-170',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        status: WorkflowTaskStatus.APPROVED,
        assigneeUserId: refs.users.reviewer.id,
        completedAt: new Date('2027-02-20T01:00:00.000Z'),
      }),
      projectClosed: await createWorkflowTask(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        taskNo: 'DEMO-COMPLETE-TASK-180',
        nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        status: WorkflowTaskStatus.COMPLETED,
        assigneeUserId: refs.users.processEngineer.id,
        completedAt: actualEndDate,
      }),
    };

    const sample = await tx.sample.create({
      data: {
        projectId: project.id,
        colorId: color.id,
        sampleNo: 'SMP-DEMO-C-001',
        sampleName: '极昼银样板',
        versionNo: 1,
        isCurrent: true,
        sampleType: SampleType.PANEL,
        status: SampleStatus.CONFIRMED,
        location: '实验室样板柜 C-01',
        producedAt: new Date('2026-01-13T00:00:00.000Z'),
        confirmedAt: new Date('2026-01-14T00:00:00.000Z'),
      },
    });

    await tx.sampleConfirmation.create({
      data: {
        projectId: project.id,
        sampleId: sample.id,
        workflowInstanceId: workflowInstance.id,
        workflowTaskId: tasks.sampleConfirm.id,
        decision: SampleConfirmationDecision.APPROVE,
        colorAssessment: '综合色相稳定。',
        appearanceAssessment: '表面效果达到量产基准。',
        comment: '样板确认通过。',
        confirmedById: refs.users.qualityEngineer.id,
        confirmedAt: new Date('2026-01-14T00:00:00.000Z'),
      },
    });

    const procurement = await tx.paintProcurement.create({
      data: {
        projectId: project.id,
        supplierId: refs.suppliers['SUP-DEMO-002'].id,
        colorId: color.id,
        procurementCode: 'PO-DEMO-C-001',
        materialName: '极昼银量产涂料',
        batchNo: 'BATCH-C-001',
        quantity: '200.000',
        unit: 'kg',
        status: ProcurementStatus.ARRIVED,
        requestedById: refs.users.purchaser.id,
        orderedAt: new Date('2026-01-16T00:00:00.000Z'),
        arrivalDate: new Date('2026-01-18T00:00:00.000Z'),
        note: '用于量产准备。',
      },
    });

    await tx.performanceTest.create({
      data: {
        projectId: project.id,
        sampleId: sample.id,
        paintProcurementId: procurement.id,
        testedById: refs.users.qualityEngineer.id,
        testCode: 'PT-DEMO-C-001',
        relatedObjectName: sample.sampleName,
        testItem: PerformanceTestType.DELTA_E,
        status: PerformanceTestStatus.SUBMITTED,
        standardValue: '< 0.8',
        actualValue: '0.4',
        result: PerformanceTestResult.PASS,
        conclusion: '综合色差在量产允许区间内。',
        testedAt: new Date('2026-01-19T00:00:00.000Z'),
        submittedAt: new Date('2026-01-20T00:00:00.000Z'),
      },
    });

    const standardBoard = await tx.standardBoard.create({
      data: {
        projectId: project.id,
        basedOnSampleId: sample.id,
        issuedById: refs.users.processEngineer.id,
        colorId: color.id,
        boardCode: 'SB-DEMO-C-001',
        versionNo: 1,
        status: StandardBoardStatus.ISSUED,
        isCurrent: true,
        producedAt: new Date('2026-01-19T00:00:00.000Z'),
        issuedAt: new Date('2026-01-20T00:00:00.000Z'),
        recipientName: '演示质量工程师',
        recipientDept: '质量验证部',
        remark: '量产冻结标准板。',
      },
    });

    await tx.boardDistributionRecord.create({
      data: {
        projectId: project.id,
        standardBoardId: standardBoard.id,
        receiverName: '演示质量工程师',
        receiverDept: '质量验证部',
        recipientDepartmentId: refs.departments.QUALITY.id,
        recipientUserId: refs.users.qualityEngineer.id,
        quantity: 1,
        status: DistributionStatus.RECEIVED,
        sentAt: new Date('2026-01-20T00:00:00.000Z'),
        signedAt: new Date('2026-01-20T06:00:00.000Z'),
        note: '量产对比基准。',
      },
    });

    await tx.colorBoardDetailUpdate.create({
      data: {
        projectId: project.id,
        standardBoardId: standardBoard.id,
        updatedById: refs.users.qualityEngineer.id,
        updateStatus: ColorBoardDetailUpdateStatus.UPDATED,
        detailUpdatedAt: new Date('2026-01-20T08:00:00.000Z'),
        note: '量产明细已更新。',
      },
    });

    const firstPlan = await tx.productionPlan.create({
      data: {
        projectId: project.id,
        createdById: refs.users.processEngineer.id,
        ownerId: refs.users.processEngineer.id,
        confirmedById: refs.users.projectManager.id,
        planNo: 'FP-DEMO-C-001',
        planType: ProductionPlanType.FIRST_UNIT,
        status: ProductionPlanStatus.CONFIRMED,
        quantity: 1,
        actualQuantity: 1,
        planDate: new Date('2026-01-22T00:00:00.000Z'),
        lineName: '涂装线 B',
        workshop: '总装二车间',
        batchNo: 'FP-BATCH-C',
        confirmedAt: new Date('2026-01-22T08:00:00.000Z'),
        actualStartAt: new Date('2026-01-23T00:00:00.000Z'),
        actualEndAt: new Date('2026-01-23T08:00:00.000Z'),
        remark: '首台计划完成。',
      },
    });

    const trialProduction = await tx.trialProduction.create({
      data: {
        projectId: project.id,
        productionPlanId: firstPlan.id,
        colorId: color.id,
        trialNo: 'TRIAL-DEMO-C-001',
        status: TrialProductionStatus.PASSED,
        quantity: 1,
        paintBatchNo: procurement.batchNo,
        result: TrialProductionResult.PASS,
        note: '样车试制一次通过。',
        location: '总装二车间',
        plannedAt: new Date('2026-01-24T00:00:00.000Z'),
        startedAt: new Date('2026-01-24T02:00:00.000Z'),
        completedAt: new Date('2026-01-25T00:00:00.000Z'),
        summary: '试制完成并进入驾驶室评审。',
      },
    });

    await tx.reviewRecord.createMany({
      data: [
        {
          projectId: project.id,
          workflowTaskId: tasks.cabinReview.id,
          trialProductionId: trialProduction.id,
          reviewerId: refs.users.reviewer.id,
          reviewType: ReviewType.CAB_REVIEW,
          result: ReviewResult.APPROVED,
          comment: '驾驶室综合色彩表现通过。',
          reviewedAt: new Date('2026-01-28T00:00:00.000Z'),
          submittedAt: new Date('2026-01-27T12:00:00.000Z'),
        },
        {
          projectId: project.id,
          workflowTaskId: tasks.consistencyReview.id,
          reviewerId: refs.users.reviewer.id,
          reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
          result: ReviewResult.CONDITIONAL_APPROVED,
          comment: '一致性评审通过。',
          conditionNote: '量产阶段需加强首批色差抽检。',
          reviewedAt: new Date('2026-02-02T00:00:00.000Z'),
          submittedAt: new Date('2026-02-01T12:00:00.000Z'),
        },
        {
          projectId: project.id,
          workflowTaskId: tasks.visualReview.id,
          reviewerId: refs.users.reviewer.id,
          reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
          result: ReviewResult.APPROVED,
          comment: '目视色差评审通过，可进入颜色退出。',
          reviewedAt: new Date('2027-02-20T00:00:00.000Z'),
          submittedAt: new Date('2027-02-19T12:00:00.000Z'),
        },
      ],
    });

    await tx.developmentFee.create({
      data: {
        projectId: project.id,
        supplierId: refs.suppliers['SUP-DEMO-002'].id,
        createdById: refs.users.finance.id,
        recordedById: refs.users.finance.id,
        feeType: DevelopmentFeeType.TESTING,
        amount: '10000.00',
        currency: 'CNY',
        payer: '演示整车厂',
        payStatus: DevelopmentFeeStatus.PAID,
        occurredAt: new Date('2026-01-29T00:00:00.000Z'),
        recordedAt: new Date('2026-01-30T00:00:00.000Z'),
        completedAt: new Date('2026-01-30T08:00:00.000Z'),
        note: '开发收费已完成。',
      },
    });

    await tx.productionPlan.createMany({
      data: [
        {
          projectId: project.id,
          createdById: refs.users.processEngineer.id,
          ownerId: refs.users.processEngineer.id,
          confirmedById: refs.users.projectManager.id,
          planNo: 'SP-DEMO-C-001',
          planType: ProductionPlanType.SCHEDULE,
          status: ProductionPlanStatus.CONFIRMED,
          quantity: 100,
          actualQuantity: 100,
          planDate: new Date('2026-02-05T00:00:00.000Z'),
          lineName: '量产线 1',
          workshop: '涂装量产车间',
          batchNo: 'SP-BATCH-C',
          confirmedAt: new Date('2026-02-05T08:00:00.000Z'),
          actualStartAt: new Date('2026-02-06T00:00:00.000Z'),
          actualEndAt: new Date('2026-02-06T08:00:00.000Z'),
          remark: '排产计划已完成。',
        },
        {
          projectId: project.id,
          createdById: refs.users.processEngineer.id,
          ownerId: refs.users.processEngineer.id,
          confirmedById: refs.users.projectManager.id,
          planNo: 'MP-DEMO-C-001',
          planType: ProductionPlanType.MASS_PRODUCTION,
          status: ProductionPlanStatus.COMPLETED,
          quantity: 100,
          actualQuantity: 96,
          planDate: new Date('2026-02-10T00:00:00.000Z'),
          lineName: '量产线 1',
          workshop: '涂装量产车间',
          batchNo: 'MP-BATCH-C',
          confirmedAt: new Date('2026-02-10T08:00:00.000Z'),
          actualStartAt: new Date('2026-02-11T00:00:00.000Z'),
          actualEndAt: new Date('2026-02-16T00:00:00.000Z'),
          remark: '批量生产完成。',
        },
      ],
    });

    await tx.colorExit.create({
      data: {
        projectId: project.id,
        workflowTaskId: tasks.projectClosed.id,
        colorId: color.id,
        operatorId: refs.users.processEngineer.id,
        exitDate: actualEndDate,
        statisticYear: 2027,
        annualOutput: 18,
        exitThreshold: 20,
        systemSuggestion: ColorExitSuggestion.EXIT,
        finalDecision: ColorExitSuggestion.EXIT,
        effectiveDate: actualEndDate,
        exitReason: '量产评审完成，项目正式收尾。',
        description: '颜色主数据进入退出状态，项目归档完成。',
        completedAt: actualEndDate,
      },
    });

    const transitionDates = [
      ['2026-01-06T00:00:00.000Z', null, tasks.initiation, null, WorkflowNodeCode.PROJECT_INITIATION, WorkflowAction.SYSTEM_SYNC, '项目创建后自动初始化流程。'],
      ['2026-01-06T01:00:00.000Z', tasks.initiation, tasks.developmentReport, WorkflowNodeCode.PROJECT_INITIATION, WorkflowNodeCode.DEVELOPMENT_REPORT, WorkflowAction.COMPLETE, '项目立项完成。'],
      ['2026-01-08T01:00:00.000Z', tasks.developmentReport, tasks.paintDevelopment, WorkflowNodeCode.DEVELOPMENT_REPORT, WorkflowNodeCode.PAINT_DEVELOPMENT, WorkflowAction.SUBMIT, '开发报告提交。'],
      ['2026-01-12T01:00:00.000Z', tasks.paintDevelopment, tasks.sampleConfirm, WorkflowNodeCode.PAINT_DEVELOPMENT, WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION, WorkflowAction.COMPLETE, '涂料开发完成。'],
      ['2026-01-14T00:00:00.000Z', tasks.sampleConfirm, tasks.paintProcurement, WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION, WorkflowNodeCode.PAINT_PROCUREMENT, WorkflowAction.APPROVE, '样板确认通过进入采购主线。'],
      ['2026-01-14T00:05:00.000Z', tasks.sampleConfirm, tasks.colorNumbering, WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION, WorkflowNodeCode.COLOR_NUMBERING, WorkflowAction.APPROVE, '并行创建新颜色取号。'],
      ['2026-01-18T01:00:00.000Z', tasks.paintProcurement, tasks.firstProductionPlan, WorkflowNodeCode.PAINT_PROCUREMENT, WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN, WorkflowAction.COMPLETE, '采购完成进入首台计划。'],
      ['2026-01-18T01:01:00.000Z', tasks.paintProcurement, tasks.performanceTest, WorkflowNodeCode.PAINT_PROCUREMENT, WorkflowNodeCode.PERFORMANCE_TEST, WorkflowAction.COMPLETE, '并行创建性能试验。'],
      ['2026-01-18T01:02:00.000Z', tasks.paintProcurement, tasks.standardBoard, WorkflowNodeCode.PAINT_PROCUREMENT, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION, WorkflowAction.COMPLETE, '并行创建标准板制作。'],
      ['2026-01-20T04:00:00.000Z', tasks.standardBoard, tasks.boardDetail, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION, WorkflowNodeCode.BOARD_DETAIL_UPDATE, WorkflowAction.COMPLETE, '标准板完成后触发色板明细更新。'],
      ['2026-01-23T01:00:00.000Z', tasks.firstProductionPlan, tasks.trialProduction, WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN, WorkflowNodeCode.TRIAL_PRODUCTION, WorkflowAction.COMPLETE, '首台计划完成。'],
      ['2026-01-25T01:00:00.000Z', tasks.trialProduction, tasks.cabinReview, WorkflowNodeCode.TRIAL_PRODUCTION, WorkflowNodeCode.CAB_REVIEW, WorkflowAction.COMPLETE, '样车试制完成。'],
      ['2026-01-28T01:00:00.000Z', tasks.cabinReview, tasks.consistencyReview, WorkflowNodeCode.CAB_REVIEW, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW, WorkflowAction.APPROVE, '驾驶室评审通过进入一致性评审。'],
      ['2026-01-28T01:01:00.000Z', tasks.cabinReview, tasks.developmentFee, WorkflowNodeCode.CAB_REVIEW, WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE, WorkflowAction.APPROVE, '驾驶室评审通过并行创建收费节点。'],
      ['2026-02-02T01:00:00.000Z', tasks.consistencyReview, tasks.schedulePlan, WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW, WorkflowNodeCode.MASS_PRODUCTION_PLAN, WorkflowAction.APPROVE, '一致性评审通过后进入排产计划。'],
      ['2026-02-06T01:00:00.000Z', tasks.schedulePlan, tasks.massProduction, WorkflowNodeCode.MASS_PRODUCTION_PLAN, WorkflowNodeCode.MASS_PRODUCTION, WorkflowAction.COMPLETE, '排产计划完成。'],
      ['2026-02-16T01:00:00.000Z', tasks.massProduction, tasks.visualReview, WorkflowNodeCode.MASS_PRODUCTION, WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW, WorkflowAction.COMPLETE, '批量生产完成后进入目视色差评审。'],
      ['2027-02-20T01:00:00.000Z', tasks.visualReview, tasks.projectClosed, WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW, WorkflowNodeCode.PROJECT_CLOSED, WorkflowAction.APPROVE, '12 个月月度评审完成后进入颜色退出。'],
    ] as const;

    for (const entry of transitionDates) {
      await createWorkflowTransition(tx, {
        workflowInstanceId: workflowInstance.id,
        projectId: project.id,
        fromTaskId: entry[1]?.id ?? null,
        toTaskId: entry[2]?.id ?? null,
        fromNodeCode: entry[3],
        toNodeCode: entry[4],
        action: entry[5],
        comment: entry[6],
        operatorUserId: refs.users.projectManager.id,
        createdAt: new Date(entry[0]),
      });
    }

    await tx.auditLog.createMany({
      data: [
        {
          projectId: project.id,
          actorUserId: refs.users.projectManager.id,
          targetType: 'PROJECT',
          targetId: project.id,
          action: 'PROJECT_CREATED',
          nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
          summary: `创建项目 ${project.name}`,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
        },
        {
          projectId: project.id,
          actorUserId: refs.users.reviewer.id,
          targetType: 'REVIEW_RECORD',
          targetId: tasks.consistencyReview.id,
          action: 'CONSISTENCY_REVIEW_APPROVED',
          nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
          summary: '一致性评审通过并激活排产计划。',
          createdAt: new Date('2026-02-02T01:00:00.000Z'),
        },
        {
          projectId: project.id,
          actorUserId: refs.users.processEngineer.id,
          targetType: 'COLOR_EXIT',
          targetId: tasks.projectClosed.id,
          action: 'COLOR_EXIT_COMPLETED',
          nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
          summary: '颜色退出完成并关闭项目。',
          createdAt: actualEndDate,
        },
      ],
    });

    await tx.notification.create({
      data: {
        userId: refs.users.projectManager.id,
        projectId: project.id,
        taskId: tasks.projectClosed.id,
        notificationType: NotificationType.SYSTEM_INFO,
        title: `${project.name} 已完成`,
        content: '颜色退出节点已完成，项目已收尾。',
        linkPath: `/projects/${project.id}/color-exit`,
        dedupeKey: 'seed:demo-complete:project-closed',
        isRead: true,
        readAt: actualEndDate,
        sendChannel: NotificationSendChannel.IN_APP,
        sendStatus: NotificationSendStatus.SENT,
      },
    });
  });
}

function addUtcMonthsClamped(baseDate: Date, offset: number) {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + offset;
  const day = baseDate.getUTCDate();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));

  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth(),
      Math.min(day, monthEnd.getUTCDate()),
    ),
  );
}

async function ensureCompletedDemoRecurringArtifacts(refs: SeedRefs) {
  const project = await prisma.project.findUnique({
    where: { code: 'DEMO-COMPLETE-001' },
    select: { id: true },
  });

  if (!project) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const [visualReviewTask, projectClosedTask, workflowInstance] = await Promise.all([
      tx.workflowTask.findFirst({
        where: {
          projectId: project.id,
          nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.workflowTask.findFirst({
        where: {
          projectId: project.id,
          nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.workflowInstance.findFirst({
        where: { projectId: project.id },
        select: { id: true },
        orderBy: { versionNo: 'desc' },
      }),
    ]);

    if (!visualReviewTask || !projectClosedTask || !workflowInstance) {
      return;
    }

    const cycleStartDate = new Date('2026-02-16T00:00:00.000Z');
    const finalReviewAt = new Date('2027-02-20T00:00:00.000Z');
    const actualEndDate = new Date('2027-02-26T00:00:00.000Z');
    const recurringEndDate = addUtcMonthsClamped(cycleStartDate, 12);

    let recurringPlan = await tx.recurringPlan.findFirst({
      where: {
        sourceWorkflowTaskId: visualReviewTask.id,
      },
      select: { id: true },
    });

    if (!recurringPlan) {
      recurringPlan = await tx.recurringPlan.create({
        data: {
          projectId: project.id,
          sourceWorkflowTaskId: visualReviewTask.id,
          sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
          planCode: 'RPLAN-DEMO-COMPLETE-001',
          frequency: 'MONTHLY',
          totalCount: 12,
          generatedCount: 12,
          startDate: cycleStartDate,
          endDate: recurringEndDate,
          status: RecurringPlanStatus.COMPLETED,
          metadata: {
            seeded: true,
            demoProject: 'DEMO-COMPLETE-001',
          },
        },
        select: { id: true },
      });
    } else {
      await tx.recurringPlan.update({
        where: { id: recurringPlan.id },
        data: {
          totalCount: 12,
          generatedCount: 12,
          startDate: cycleStartDate,
          endDate: recurringEndDate,
          status: RecurringPlanStatus.COMPLETED,
          metadata: {
            seeded: true,
            demoProject: 'DEMO-COMPLETE-001',
          },
        },
      });
    }

    for (let index = 1; index <= 12; index += 1) {
      const plannedDate = addUtcMonthsClamped(cycleStartDate, index);
      const completedAt = new Date(
        Date.UTC(
          plannedDate.getUTCFullYear(),
          plannedDate.getUTCMonth(),
          Math.min(plannedDate.getUTCDate() + 2, 28),
          8,
        ),
      );

      const existingTask = await tx.recurringTask.findFirst({
        where: {
          recurringPlanId: recurringPlan.id,
          periodIndex: index,
        },
        select: { id: true },
      });

      const taskData = {
        projectId: project.id,
        recurringPlanId: recurringPlan.id,
        taskCode: `DEMO-COMPLETE-MONTHLY-${plannedDate.getUTCFullYear()}${String(plannedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(index).padStart(2, '0')}`,
        periodIndex: index,
        periodLabel: `${plannedDate.getUTCFullYear()}-${String(plannedDate.getUTCMonth() + 1).padStart(2, '0')}`,
        plannedDate,
        dueAt: new Date(
          Date.UTC(
            plannedDate.getUTCFullYear(),
            plannedDate.getUTCMonth(),
            plannedDate.getUTCDate(),
            23,
            59,
            59,
          ),
        ),
        completedAt,
        reviewerId: refs.users.reviewer.id,
        status: RecurringTaskStatus.COMPLETED,
        result: index <= 10 ? ReviewResult.APPROVED : ReviewResult.CONDITIONAL_APPROVED,
        comment:
          index <= 10
            ? '月度色差一致性评审完成。'
            : '月度色差一致性评审完成，并记录持续观察项。',
        payload: {
          seeded: true,
          projectCode: 'DEMO-COMPLETE-001',
          monthIndex: index,
        },
      };

      if (existingTask) {
        await tx.recurringTask.update({
          where: { id: existingTask.id },
          data: taskData,
        });
      } else {
        await tx.recurringTask.create({
          data: taskData,
        });
      }
    }

    await Promise.all([
      tx.project.update({
        where: { id: project.id },
        data: {
          plannedEndDate: new Date('2027-02-28T00:00:00.000Z'),
          actualEndDate,
          closedAt: actualEndDate,
        },
      }),
      tx.workflowInstance.update({
        where: { id: workflowInstance.id },
        data: {
          completedAt: actualEndDate,
        },
      }),
      tx.workflowTask.update({
        where: { id: visualReviewTask.id },
        data: {
          completedAt: new Date('2027-02-20T01:00:00.000Z'),
        },
      }),
      tx.workflowTask.update({
        where: { id: projectClosedTask.id },
        data: {
          completedAt: actualEndDate,
        },
      }),
      tx.reviewRecord.updateMany({
        where: {
          workflowTaskId: visualReviewTask.id,
          reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
        data: {
          reviewedAt: finalReviewAt,
          submittedAt: new Date('2027-02-19T12:00:00.000Z'),
          comment: '12 个月月度评审完成，可进入颜色退出。',
        },
      }),
      tx.colorExit.updateMany({
        where: {
          projectId: project.id,
          workflowTaskId: projectClosedTask.id,
        },
        data: {
          exitDate: actualEndDate,
          statisticYear: 2027,
          annualOutput: 18,
          exitThreshold: 20,
          systemSuggestion: ColorExitSuggestion.EXIT,
          finalDecision: ColorExitSuggestion.EXIT,
          effectiveDate: actualEndDate,
          completedAt: actualEndDate,
        },
      }),
      tx.color.updateMany({
        where: {
          projectId: project.id,
          isPrimary: true,
        },
        data: {
          status: ColorStatus.EXITED,
          exitFlag: true,
          exitDate: actualEndDate,
        },
      }),
      tx.workflowTransition.updateMany({
        where: {
          workflowInstanceId: workflowInstance.id,
          fromNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
          toNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        },
        data: {
          comment: '12 个月月度评审完成后进入颜色退出。',
          createdAt: new Date('2027-02-20T01:00:00.000Z'),
        },
      }),
      tx.notification.updateMany({
        where: {
          projectId: project.id,
          taskId: projectClosedTask.id,
          dedupeKey: 'seed:demo-complete:project-closed',
        },
        data: {
          readAt: actualEndDate,
        },
      }),
    ]);
  });
}

async function main() {
  const refs = await upsertBaseData();
  await ensureActiveDemoProject(refs);
  await ensureCompletedDemoProject(refs);
  await ensureCompletedDemoRecurringArtifacts(refs);
}

void main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Prisma seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
