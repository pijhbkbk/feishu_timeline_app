import { WorkflowNodeCode } from '@prisma/client';

export type R26AssignmentRule = {
  primaryDepartmentCode: string;
  collaboratorDepartmentCodes: string[];
};

export const R26_ASSIGNMENT_RULES: Record<WorkflowNodeCode, R26AssignmentRule> = {
  [WorkflowNodeCode.PROJECT_INITIATION]: {
    primaryDepartmentCode: 'PMO',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.DEVELOPMENT_REPORT]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.PAINT_DEVELOPMENT]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION]: {
    primaryDepartmentCode: 'QUALITY',
    collaboratorDepartmentCodes: ['REVIEW'],
  },
  [WorkflowNodeCode.COLOR_NUMBERING]: {
    primaryDepartmentCode: 'PMO',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.PAINT_PROCUREMENT]: {
    primaryDepartmentCode: 'PURCHASING',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.STANDARD_BOARD_PRODUCTION]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.BOARD_DETAIL_UPDATE]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.PERFORMANCE_TEST]: {
    primaryDepartmentCode: 'QUALITY',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN]: {
    primaryDepartmentCode: 'PMO',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.TRIAL_PRODUCTION]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.CAB_REVIEW]: {
    primaryDepartmentCode: 'QUALITY',
    collaboratorDepartmentCodes: ['REVIEW'],
  },
  [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE]: {
    primaryDepartmentCode: 'FINANCE',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW]: {
    primaryDepartmentCode: 'QUALITY',
    collaboratorDepartmentCodes: ['REVIEW'],
  },
  [WorkflowNodeCode.MASS_PRODUCTION_PLAN]: {
    primaryDepartmentCode: 'PMO',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.MASS_PRODUCTION]: {
    primaryDepartmentCode: 'PROCESS',
    collaboratorDepartmentCodes: [],
  },
  [WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW]: {
    primaryDepartmentCode: 'QUALITY',
    collaboratorDepartmentCodes: ['REVIEW'],
  },
  [WorkflowNodeCode.PROJECT_CLOSED]: {
    primaryDepartmentCode: 'PMO',
    collaboratorDepartmentCodes: ['REVIEW'],
  },
};
