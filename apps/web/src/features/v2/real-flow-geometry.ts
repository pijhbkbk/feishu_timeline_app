import type { R26NodeShape } from './types';

export const R26_REAL_FLOW_GEOMETRY: Record<
  string,
  {
    x: number;
    y: number;
    width: number;
    height: number;
    shape: R26NodeShape;
    shortName?: string;
  }
> = {
  PROJECT_INITIATION: { x: 625, y: 80, width: 190, height: 92, shape: 'rounded' },
  DEVELOPMENT_REPORT: { x: 625, y: 190, width: 190, height: 92, shape: 'rounded' },
  PAINT_DEVELOPMENT: { x: 625, y: 300, width: 190, height: 92, shape: 'rounded' },
  SAMPLE_COLOR_CONFIRMATION: { x: 625, y: 410, width: 190, height: 92, shape: 'rounded' },
  COLOR_NUMBERING: { x: 945, y: 410, width: 190, height: 92, shape: 'branch' },
  PAINT_PROCUREMENT: { x: 625, y: 540, width: 190, height: 92, shape: 'rounded' },
  STANDARD_BOARD_PRODUCTION: { x: 945, y: 540, width: 190, height: 92, shape: 'branch' },
  BOARD_DETAIL_UPDATE: { x: 1185, y: 540, width: 190, height: 92, shape: 'branch' },
  PERFORMANCE_TEST: { x: 305, y: 540, width: 190, height: 92, shape: 'branch' },
  FIRST_UNIT_PRODUCTION_PLAN: { x: 625, y: 670, width: 190, height: 92, shape: 'rounded' },
  TRIAL_PRODUCTION: { x: 625, y: 800, width: 190, height: 92, shape: 'rounded' },
  CAB_REVIEW: { x: 615, y: 940, width: 210, height: 130, shape: 'decision' },
  DEVELOPMENT_ACCEPTANCE: { x: 305, y: 1040, width: 190, height: 92, shape: 'branch' },
  COLOR_CONSISTENCY_REVIEW: { x: 625, y: 1120, width: 190, height: 92, shape: 'rounded' },
  MASS_PRODUCTION_PLAN: { x: 625, y: 1250, width: 190, height: 92, shape: 'rounded' },
  MASS_PRODUCTION: { x: 625, y: 1380, width: 190, height: 92, shape: 'rounded' },
  VISUAL_COLOR_DIFFERENCE_REVIEW: {
    x: 605,
    y: 1510,
    width: 230,
    height: 100,
    shape: 'monthly',
    shortName: '色差目视评审',
  },
  PROJECT_CLOSED: { x: 625, y: 1640, width: 190, height: 84, shape: 'terminal' },
};
