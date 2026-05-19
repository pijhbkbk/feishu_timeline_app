import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  FlowMapConnector,
  FlowMapNode,
} from './flow-map-workspace';
import type {
  ProjectFlowMapEdge,
  ProjectFlowMapNode,
} from '../lib/projects-client';

describe('FlowMap realtime UI atoms', () => {
  it('renders node status, owner, due date and material tooltip in Chinese', () => {
    const html = renderToStaticMarkup(
      <FlowMapNode
        node={createFlowMapNode({
          stepCode: '06',
          stepNumber: 6,
          stepName: '涂料采购',
          nodeCode: 'PAINT_PROCUREMENT',
          status: 'IN_PROGRESS',
          statusLabel: '进行中',
          ownerName: '张七巧',
          departmentName: '采购部',
          dueAt: '2026-05-27T00:00:00.000Z',
          materialProgress: {
            submitted: 2,
            required: 3,
            total: 3,
            missing: 1,
            text: '2 / 3',
          },
        })}
        layout={{ x: 0, y: 0, width: 180, height: 86 }}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('涂料采购');
    expect(html).toContain('进行中');
    expect(html).toContain('张七巧');
    expect(html).toContain('材料提交：2 / 3');
    expect(html).toContain('点击查看详情');
  });

  it('clicks a flow map node through the component handler', () => {
    const onSelect = vi.fn();
    const node = createFlowMapNode({
      taskId: 'task-6',
      stepCode: '06',
      stepNumber: 6,
      stepName: '涂料采购',
      nodeCode: 'PAINT_PROCUREMENT',
    });
    const element = FlowMapNode({
      node,
      layout: { x: 0, y: 0, width: 180, height: 86 },
      onSelect,
    });

    element.props.onClick();

    expect(onSelect).toHaveBeenCalledWith(node);
  });

  it('renders completed and return connectors with matching visual classes', () => {
    const completedHtml = renderToStaticMarkup(
      <svg>
        <FlowMapConnector edge={createFlowMapEdge({ status: 'completed' })} />
      </svg>,
    );
    const returnHtml = renderToStaticMarkup(
      <svg>
        <FlowMapConnector
          edge={createFlowMapEdge({
            fromNodeCode: 'CAB_REVIEW',
            toNodeCode: 'TRIAL_PRODUCTION',
            edgeType: 'return',
            status: 'rejected',
          })}
        />
      </svg>,
    );

    expect(completedHtml).toContain('flow-map-edge-completed');
    expect(returnHtml).toContain('flow-map-edge-return');
    expect(returnHtml).toContain('flow-map-edge-rejected');
  });

  it('renders step 12, step 17 and step 18 special node labels', () => {
    const html = renderToStaticMarkup(
      <>
        <FlowMapNode
          node={createFlowMapNode({
            stepCode: '12',
            stepNumber: 12,
            stepName: '样车驾驶室评审',
            nodeCode: 'CAB_REVIEW',
            status: 'PENDING_REVIEW',
            statusLabel: '待评审',
            nodeType: 'DECISION',
          })}
          layout={{ x: 0, y: 0, width: 220, height: 120 }}
          onSelect={() => undefined}
        />
        <FlowMapNode
          node={createFlowMapNode({
            stepCode: '17',
            stepNumber: 17,
            stepName: '整车色差一致性评审',
            nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
            status: 'MONTHLY_TRACKING',
            statusLabel: '月度跟踪中',
          })}
          layout={{ x: 0, y: 0, width: 180, height: 86 }}
          onSelect={() => undefined}
        />
        <FlowMapNode
          node={createFlowMapNode({
            stepCode: '18',
            stepNumber: 18,
            stepName: '颜色退出',
            nodeCode: 'PROJECT_CLOSED',
            status: 'EXIT_PENDING',
            statusLabel: '待退出',
            nodeType: 'TERMINAL',
          })}
          layout={{ x: 0, y: 0, width: 180, height: 76 }}
          onSelect={() => undefined}
        />
      </>,
    );

    expect(html).toContain('样车驾驶室评审');
    expect(html).toContain('月度跟踪中');
    expect(html).toContain('颜色退出');
  });
});

function createFlowMapNode(overrides: Partial<ProjectFlowMapNode>): ProjectFlowMapNode {
  return {
    taskId: 'task-1',
    stepCode: '01',
    stepNumber: 1,
    stepName: '反映市场需求',
    nodeCode: 'PROJECT_INITIATION',
    status: 'NOT_STARTED',
    statusLabel: '未开始',
    ownerName: '项目经理',
    departmentName: '项目部',
    dueAt: null,
    overdueDays: 0,
    isOverdue: false,
    isBlocking: true,
    isMainline: true,
    nodeType: 'MAINLINE',
    materialProgress: {
      submitted: 0,
      required: 0,
      total: 0,
      missing: 0,
      text: '0 个附件',
    },
    roundNo: 1,
    reviewGate: null,
    monthlyReview: null,
    colorExit: null,
    ...overrides,
  };
}

function createFlowMapEdge(overrides: Partial<ProjectFlowMapEdge>): ProjectFlowMapEdge {
  return {
    fromStepCode: 'PROJECT_INITIATION',
    toStepCode: 'DEVELOPMENT_REPORT',
    fromNodeCode: 'PROJECT_INITIATION',
    toNodeCode: 'DEVELOPMENT_REPORT',
    edgeType: 'mainline',
    status: 'completed',
    label: null,
    ...overrides,
  };
}
