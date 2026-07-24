export type R26NodeStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'COMPLETED_LATE'
  | 'OVERDUE'
  | 'RETURNED'
  | 'MONTHLY_TRACKING'
  | 'EXIT_PENDING';

export type R26NodeShape = 'rounded' | 'branch' | 'decision' | 'monthly' | 'terminal';

export type R26FlowNode = {
  step: number;
  code: string;
  name: string;
  shortName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: R26NodeShape;
  status: R26NodeStatus;
  owner: string;
  department: string;
  deadline: string;
  taskId: string | null;
  round: number;
  monthlyCompleted?: number;
  monthlyTotal?: number;
  collaborators: string[];
  approver: string;
  startedAt: string;
  remainingDays: number | null;
  overdueDays: number;
  requirement: string;
  output: string;
  requiredMaterials: string[];
  uploadedMaterials: string[];
  missingMaterials: string[];
  recentEvents: Array<{ time: string; text: string }>;
};

export type R26EdgeType = 'mainline' | 'parallel' | 'nonBlocking' | 'return';

export type R26FlowEdge = {
  id: string;
  from: number;
  to: number;
  path: string;
  type: R26EdgeType;
  label?: 'Y' | 'N';
};

export type R26ProjectTone = 'risk' | 'review' | 'tracking';

export type R26Project = {
  id: string;
  name: string;
  colorName: string;
  colorHex: string;
  tone: R26ProjectTone;
  status: string;
  currentStep: string;
  owner: string;
  deadline: string;
  progress: string;
  updatedAt: string;
  riskReason: string;
  expectedResolution: string;
};
