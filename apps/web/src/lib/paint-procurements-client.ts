'use client';

import {
  apiRequest,
  type FrontendRoleCode,
  type SessionUser,
} from './auth-client';
import {
  formatDate,
  getProjectPriorityLabel,
  getWorkflowNodeLabel,
  type ProjectPriority,
  type WorkflowNodeCode,
} from './projects-client';
import {
  canUserOperateWorkflowTask,
  getWorkflowTaskStatusLabel,
  type WorkflowTaskSummary,
} from './workflows-client';

export type SupplierStatus = 'ACTIVE' | 'INACTIVE';
export type ProcurementStatus = 'DRAFT' | 'ORDERED' | 'ARRIVED' | 'CANCELLED';

export type SupplierSummary = {
  id: string;
  supplierCode: string;
  supplierName: string;
  contactName: string | null;
  contactPhone: string | null;
  status: SupplierStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type PaintProcurementRecord = {
  id: string;
  procurementCode: string;
  supplierId: string | null;
  materialName: string | null;
  batchNo: string | null;
  quantity: string | null;
  unit: string | null;
  arrivalDate: string | null;
  status: ProcurementStatus;
  note: string | null;
  orderedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: SupplierSummary | null;
};

export type PaintProcurementWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  activeTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  statistics: {
    totalCount: number;
    arrivedCount: number;
    orderedCount: number;
    cancelledCount: number;
  };
  suppliers: SupplierSummary[];
  items: PaintProcurementRecord[];
  downstreamTasks: {
    firstProductionPlan: WorkflowTaskSummary | null;
    performanceTest: WorkflowTaskSummary | null;
    standardBoardCreateDistribute: WorkflowTaskSummary | null;
  };
};

export type PaintProcurementFormInput = {
  supplierId: string;
  procurementCode: string;
  materialName: string;
  batchNo: string;
  quantity: string;
  unit: string;
  arrivalDate: string;
  note: string;
};

export type SupplierFormInput = {
  supplierCode: string;
  supplierName: string;
  contactName: string;
  contactPhone: string;
  status: SupplierStatus;
};

export const PROCUREMENT_STATUS_OPTIONS: Array<{
  value: ProcurementStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ORDERED', label: '已下单' },
  { value: 'ARRIVED', label: '已到货' },
  { value: 'CANCELLED', label: '已取消' },
];

const PROCUREMENT_STATUS_LABELS = Object.fromEntries(
  PROCUREMENT_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ProcurementStatus, string>;

const PROCUREMENT_ALLOWED_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'purchaser',
];

export async function fetchPaintProcurementWorkspace(projectId: string) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements`,
  );
}

export async function fetchSuppliers() {
  return apiRequest<SupplierSummary[]>('/suppliers');
}

export async function createSupplier(input: SupplierFormInput) {
  return apiRequest<SupplierSummary>('/suppliers', {
    method: 'POST',
    body: input,
  });
}

export async function updateSupplier(supplierId: string, input: SupplierFormInput) {
  return apiRequest<SupplierSummary>(`/suppliers/${supplierId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function createPaintProcurement(
  projectId: string,
  input: PaintProcurementFormInput,
) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements`,
    {
      method: 'POST',
      body: {
        ...input,
        quantity: Number(input.quantity),
      },
    },
  );
}

export async function updatePaintProcurement(
  projectId: string,
  procurementId: string,
  input: PaintProcurementFormInput,
) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements/${procurementId}`,
    {
      method: 'PATCH',
      body: {
        ...input,
        quantity: Number(input.quantity),
      },
    },
  );
}

export async function orderPaintProcurement(projectId: string, procurementId: string) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements/${procurementId}/order`,
    {
      method: 'POST',
    },
  );
}

export async function markArrivedPaintProcurement(
  projectId: string,
  procurementId: string,
) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements/${procurementId}/mark-arrived`,
    {
      method: 'POST',
    },
  );
}

export async function cancelPaintProcurement(projectId: string, procurementId: string) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements/${procurementId}/cancel`,
    {
      method: 'POST',
    },
  );
}

export async function completePaintProcurementTask(projectId: string) {
  return apiRequest<PaintProcurementWorkspaceResponse>(
    `/projects/${projectId}/paint-procurements/complete-task`,
    {
      method: 'POST',
    },
  );
}

export function getProcurementStatusLabel(status: ProcurementStatus) {
  return PROCUREMENT_STATUS_LABELS[status];
}

export function validateProcurementForm(input: PaintProcurementFormInput) {
  if (!input.procurementCode.trim()) {
    return '采购单号不能为空。';
  }

  if (!input.supplierId.trim()) {
    return '供应商不能为空。';
  }

  if (!input.materialName.trim()) {
    return '物料名称不能为空。';
  }

  if (!input.batchNo.trim()) {
    return '批次号不能为空。';
  }

  if (!input.quantity.trim()) {
    return '数量不能为空。';
  }

  if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0) {
    return '数量必须大于 0。';
  }

  if (!input.unit.trim()) {
    return '单位不能为空。';
  }

  if (!input.arrivalDate.trim()) {
    return '到货日期不能为空。';
  }

  return null;
}

export function validateSupplierForm(input: SupplierFormInput) {
  if (!input.supplierCode.trim()) {
    return '供应商编码不能为空。';
  }

  if (!input.supplierName.trim()) {
    return '供应商名称不能为空。';
  }

  return null;
}

export function canManagePaintProcurement(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin) {
    return true;
  }

  return user.roleCodes.some((roleCode) =>
    PROCUREMENT_ALLOWED_ROLE_CODES.includes(roleCode),
  );
}

export function canShowCompleteProcurementTaskButton(
  user: SessionUser | null,
  workspace: PaintProcurementWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return (
    canManagePaintProcurement(user) &&
    canUserOperateWorkflowTask(user, workspace.activeTask)
  );
}

export function getProcurementWorkspaceHighlights(
  workspace: PaintProcurementWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无采购任务',
  };
}
