import { WorkflowNodeCode } from '@prisma/client';

export type R26DepartmentRule = {
  code: string;
  name: string;
  directoryCode?: string;
};

export type R26AssignmentRule = {
  primaryDepartment: R26DepartmentRule;
  collaboratorDepartments: R26DepartmentRule[];
  reviewerDepartments?: R26DepartmentRule[];
};

const department = (
  code: string,
  name: string,
  directoryCode?: string,
): R26DepartmentRule => ({
  code,
  name,
  ...(directoryCode ? { directoryCode } : {}),
});

const MARKETING = department('MARKETING', '营销公司');
const PAINT_PROCESS = department('PAINT_PROCESS', '涂装工艺部', 'PROCESS');
const PAINT_PLANT = department('PAINT_PLANT', '涂装厂');
const PRODUCTION = department('PRODUCTION', '生产部');
const QUALITY = department('QUALITY_MANAGEMENT', '质量管理部', 'QUALITY');
const PURCHASING = department('PURCHASING', '采购部');
const PROCUREMENT_CENTER = department('PROCUREMENT_CENTER', '采购中心', 'PURCHASING');
const FINANCE = department('FINANCE', '财务部');
const PROJECT_MANAGEMENT = department('PROJECT_MANAGEMENT', '项目管理部', 'PMO');
const REVIEW_COMMITTEE = department('REVIEW', '评审委员会');

export const R26_ASSIGNMENT_RULES: Record<WorkflowNodeCode, R26AssignmentRule> = {
  [WorkflowNodeCode.PROJECT_INITIATION]: {
    primaryDepartment: MARKETING,
    collaboratorDepartments: [PAINT_PROCESS],
  },
  [WorkflowNodeCode.DEVELOPMENT_REPORT]: {
    primaryDepartment: MARKETING,
    collaboratorDepartments: [PAINT_PROCESS],
  },
  [WorkflowNodeCode.PAINT_DEVELOPMENT]: {
    primaryDepartment: PURCHASING,
    collaboratorDepartments: [MARKETING],
  },
  [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [MARKETING],
    reviewerDepartments: [REVIEW_COMMITTEE],
  },
  [WorkflowNodeCode.COLOR_NUMBERING]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [],
  },
  [WorkflowNodeCode.PAINT_PROCUREMENT]: {
    primaryDepartment: PURCHASING,
    collaboratorDepartments: [],
  },
  [WorkflowNodeCode.STANDARD_BOARD_PRODUCTION]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [PAINT_PLANT],
  },
  [WorkflowNodeCode.BOARD_DETAIL_UPDATE]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [],
  },
  [WorkflowNodeCode.PERFORMANCE_TEST]: {
    primaryDepartment: QUALITY,
    collaboratorDepartments: [PAINT_PROCESS],
  },
  [WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN]: {
    primaryDepartment: MARKETING,
    collaboratorDepartments: [PRODUCTION],
  },
  [WorkflowNodeCode.TRIAL_PRODUCTION]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [PAINT_PLANT],
  },
  [WorkflowNodeCode.CAB_REVIEW]: {
    primaryDepartment: QUALITY,
    collaboratorDepartments: [PAINT_PROCESS, PAINT_PLANT, MARKETING],
    reviewerDepartments: [REVIEW_COMMITTEE],
  },
  [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE]: {
    primaryDepartment: MARKETING,
    collaboratorDepartments: [FINANCE],
    reviewerDepartments: [FINANCE],
  },
  [WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW]: {
    primaryDepartment: PAINT_PROCESS,
    collaboratorDepartments: [QUALITY, PAINT_PLANT],
    reviewerDepartments: [REVIEW_COMMITTEE],
  },
  [WorkflowNodeCode.MASS_PRODUCTION_PLAN]: {
    primaryDepartment: PRODUCTION,
    collaboratorDepartments: [PAINT_PLANT],
  },
  [WorkflowNodeCode.MASS_PRODUCTION]: {
    primaryDepartment: PAINT_PLANT,
    collaboratorDepartments: [PRODUCTION],
  },
  [WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW]: {
    primaryDepartment: QUALITY,
    collaboratorDepartments: [PROCUREMENT_CENTER, PAINT_PROCESS, PAINT_PLANT],
    reviewerDepartments: [REVIEW_COMMITTEE],
  },
  [WorkflowNodeCode.PROJECT_CLOSED]: {
    primaryDepartment: MARKETING,
    collaboratorDepartments: [PAINT_PROCESS, PROJECT_MANAGEMENT],
  },
};
