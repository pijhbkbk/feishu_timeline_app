import type { WorkflowNodeCode } from '@prisma/client';

export const BUSINESS_ROLES = [
  { code: 'project_manager', name: '项目协调', nodes: '01、02、18' },
  { code: 'process_engineer', name: '工艺', nodes: '03、05、07、08、11' },
  { code: 'purchaser', name: '采购', nodes: '06' },
  { code: 'quality_engineer', name: '质量试验', nodes: '09、17' },
  { code: 'reviewer', name: '评审', nodes: '04、12、14' },
  { code: 'production_operator', name: '生产', nodes: '10、15、16' },
  { code: 'finance', name: '财务', nodes: '13' },
] as const;

export type BusinessRoleCode = (typeof BUSINESS_ROLES)[number]['code'];
export const BUSINESS_ROLE_CODES: string[] = BUSINESS_ROLES.map(role => role.code);
export function isBusinessRole(value: string): value is BusinessRoleCode {
  return BUSINESS_ROLE_CODES.includes(value);
}

// This mapping is versioned with the fixed product workflow, never supplied by a client.
export const NODE_BUSINESS_ROLES: Record<WorkflowNodeCode, BusinessRoleCode> = {
  PROJECT_INITIATION: 'project_manager',
  DEVELOPMENT_REPORT: 'project_manager',
  PAINT_DEVELOPMENT: 'process_engineer',
  SAMPLE_COLOR_CONFIRMATION: 'reviewer',
  COLOR_NUMBERING: 'process_engineer',
  PAINT_PROCUREMENT: 'purchaser',
  STANDARD_BOARD_PRODUCTION: 'process_engineer',
  BOARD_DETAIL_UPDATE: 'process_engineer',
  PERFORMANCE_TEST: 'quality_engineer',
  FIRST_UNIT_PRODUCTION_PLAN: 'production_operator',
  TRIAL_PRODUCTION: 'process_engineer',
  CAB_REVIEW: 'reviewer',
  DEVELOPMENT_ACCEPTANCE: 'finance',
  COLOR_CONSISTENCY_REVIEW: 'reviewer',
  MASS_PRODUCTION_PLAN: 'production_operator',
  MASS_PRODUCTION: 'production_operator',
  VISUAL_COLOR_DIFFERENCE_REVIEW: 'quality_engineer',
  PROJECT_CLOSED: 'project_manager',
};
