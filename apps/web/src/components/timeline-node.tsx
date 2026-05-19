'use client';

import React from 'react';

import { formatDate } from '../lib/projects-client';
import {
  getTimelineNodeStatusLabel,
  getTimelineNodeTone,
  type TimelineNodeStatus,
} from '../lib/status-labels';

export type TimelineNodeViewModel = {
  taskId: string | null;
  stepNumber: number;
  stepCode?: string | null;
  stepName?: string;
  nodeName: string;
  status: TimelineNodeStatus | string;
  ownerName?: string | null;
  departmentName?: string | null;
  dueAt?: string | null;
  isOverdue?: boolean;
  overdueDays?: number;
  isBlocking?: boolean;
  nodeType?: 'MAINLINE' | 'PARALLEL';
};

type TimelineNodeProps = {
  node: TimelineNodeViewModel;
  variant?: 'board' | 'detail';
  selected?: boolean;
  onSelect: (taskId: string) => void;
};

export function TimelineNode({
  node,
  variant = 'board',
  selected = false,
  onSelect,
}: TimelineNodeProps) {
  const disabled = !node.taskId;
  const statusLabel = getTimelineNodeStatusLabel(node.status);
  const tone = getTimelineNodeTone(node.status);
  const dueText = formatDate(node.dueAt);
  const distanceText =
    node.isOverdue && (node.overdueDays ?? 0) > 0
      ? `逾期 ${node.overdueDays} 天`
      : getRemainingText(node.dueAt);

  return (
    <button
      type="button"
      className={`${variant === 'detail' ? 'single-project-node-trigger' : 'timeline-board-node'} timeline-board-node-${tone}${
        selected ? ' timeline-node-selected' : ''
      }`}
      disabled={disabled}
      data-testid={`timeline-node-${String(node.stepNumber).padStart(2, '0')}`}
      aria-label={`第 ${node.stepNumber} 步 ${node.stepName ?? node.nodeName}，点击查看详情`}
      onClick={() => node.taskId && onSelect(node.taskId)}
    >
      <span className="timeline-board-step">{String(node.stepNumber).padStart(2, '0')}</span>
      <strong>{node.stepName ?? node.nodeName}</strong>
      <small>{statusLabel}</small>
      {node.isOverdue ? <em>逾期 {node.overdueDays ?? 0} 天</em> : null}
      <TimelineNodeTooltip
        stepNumber={node.stepNumber}
        stepName={node.stepName ?? node.nodeName}
        statusLabel={statusLabel}
        ownerName={node.ownerName ?? '未分配'}
        departmentName={node.departmentName ?? '未分配'}
        dueText={dueText}
        distanceText={distanceText}
        disabled={disabled}
      />
    </button>
  );
}

export function TimelineNodeTooltip({
  stepNumber,
  stepName,
  statusLabel,
  ownerName,
  departmentName,
  dueText,
  distanceText,
  disabled,
}: {
  stepNumber: number;
  stepName: string;
  statusLabel: string;
  ownerName: string;
  departmentName: string;
  dueText: string;
  distanceText: string;
  disabled: boolean;
}) {
  return (
    <span className="timeline-node-tooltip" role="tooltip">
      <span>步骤号：{String(stepNumber).padStart(2, '0')}</span>
      <span>工序名称：{stepName}</span>
      <span>状态：{statusLabel}</span>
      <span>负责人：{ownerName}</span>
      <span>责任部门：{departmentName}</span>
      <span>截止时间：{dueText}</span>
      <span>{distanceText}</span>
      <span>{disabled ? '工序尚未触发，暂无详情' : '点击查看详情'}</span>
    </span>
  );
}

function getRemainingText(dueAt: string | null | undefined) {
  if (!dueAt) {
    return '未设置截止时间';
  }

  const diff = new Date(dueAt).getTime() - Date.now();

  if (diff <= 0) {
    return '今日到期';
  }

  return `剩余 ${Math.ceil(diff / 86_400_000)} 个工作日`;
}
