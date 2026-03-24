import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProcurementRecordList } from './paint-procurement-workspace';
import {
  canShowCompleteProcurementTaskButton,
  validateProcurementForm,
  type PaintProcurementWorkspaceResponse,
} from '../lib/paint-procurements-client';
import type { SessionUser } from '../lib/auth-client';

const baseWorkspace: PaintProcurementWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'PAINT_PROCUREMENT',
    currentNodeName: '涂料采购',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'PAINT_PROCUREMENT',
    nodeName: '涂料采购',
    taskRound: 1,
    status: 'IN_PROGRESS',
    isPrimary: true,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '采购专员',
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: '2026-03-25T00:00:00.000Z',
    startedAt: '2026-03-20T00:00:00.000Z',
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: ['COMPLETE'],
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  },
  canCompleteTask: true,
  completionIssue: null,
  statistics: {
    totalCount: 1,
    arrivedCount: 1,
    orderedCount: 0,
    cancelledCount: 0,
  },
  suppliers: [],
  items: [
    {
      id: 'proc-1',
      procurementCode: 'PO-001',
      supplierId: 'supplier-1',
      materialName: '银灰金属漆',
      batchNo: 'BATCH-01',
      quantity: '200.5',
      unit: 'KG',
      arrivalDate: '2026-03-22T00:00:00.000Z',
      status: 'ARRIVED',
      note: '首批到货',
      orderedAt: '2026-03-20T00:00:00.000Z',
      cancelledAt: null,
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-22T00:00:00.000Z',
      supplier: {
        id: 'supplier-1',
        supplierCode: 'SUP-001',
        supplierName: '华东涂料',
        contactName: '张工',
        contactPhone: '13800000000',
        status: 'ACTIVE',
      },
    },
  ],
  downstreamTasks: {
    firstProductionPlan: null,
    performanceTest: null,
    standardBoardCreateDistribute: null,
  },
};

const purchaserUser: SessionUser = {
  id: 'user-1',
  username: 'buyer',
  name: '采购专员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['purchaser'],
};

describe('PaintProcurementWorkspace', () => {
  it('renders procurement record list rows', () => {
    const html = renderToStaticMarkup(
      <ProcurementRecordList
        items={baseWorkspace.items}
        canManage
        isReadOnly={false}
        actingKey={null}
      />,
    );

    expect(html).toContain('PO-001');
    expect(html).toContain('华东涂料');
    expect(html).toContain('银灰金属漆');
    expect(html).toContain('已到货');
  });

  it('validates procurement form input before submit', () => {
    expect(
      validateProcurementForm({
        supplierId: '',
        procurementCode: '',
        materialName: '',
        batchNo: '',
        quantity: '0',
        unit: '',
        arrivalDate: '',
        note: '',
      }),
    ).toBe('采购单号不能为空。');

    expect(
      validateProcurementForm({
        supplierId: 'supplier-1',
        procurementCode: 'PO-002',
        materialName: '黑色面漆',
        batchNo: 'LOT-02',
        quantity: '10',
        unit: 'KG',
        arrivalDate: '2026-03-22',
        note: '',
      }),
    ).toBeNull();
  });

  it('shows complete button only when permission and completion conditions are both satisfied', () => {
    expect(canShowCompleteProcurementTaskButton(purchaserUser, baseWorkspace)).toBe(true);
    expect(
      canShowCompleteProcurementTaskButton(purchaserUser, {
        ...baseWorkspace,
        canCompleteTask: false,
        completionIssue: '没有已到货的采购记录，不能完成采购节点。',
      }),
    ).toBe(false);
    expect(
      canShowCompleteProcurementTaskButton(
        {
          ...purchaserUser,
          id: 'user-2',
          roleCodes: ['quality_engineer'],
        },
        baseWorkspace,
      ),
    ).toBe(false);
  });
});
