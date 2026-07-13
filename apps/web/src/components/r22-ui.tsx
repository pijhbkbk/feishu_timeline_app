import Link from 'next/link';
import React, { type PropsWithChildren, type ReactNode } from 'react';

import { formatDate, type ProjectPriority } from '../lib/projects-client';
import type { PersonalDashboardTask } from '../lib/dashboard-client';

export type R22Tone = 'brand' | 'success' | 'warning' | 'danger' | 'monthly' | 'neutral';

export function R22Card({
  children,
  className = '',
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`r22-card ${className}`.trim()}>{children}</section>;
}

export function R22StatusBadge({ tone = 'neutral', children }: PropsWithChildren<{ tone?: R22Tone }>) {
  return <span className={`r22-status r22-status-${tone}`}>{children}</span>;
}

export function R22ProgressBar({ value, label }: { value: number; label?: string }) {
  const normalizedValue = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className="r22-progress" aria-label={label ?? `完成 ${normalizedValue}%`}>
      <span style={{ width: `${normalizedValue}%` }} />
    </div>
  );
}

export function R22Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: R22Tone;
}) {
  return (
    <article className={`r22-kpi r22-kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export function R22TaskCard({
  task,
  primary = false,
  actions,
}: {
  task: PersonalDashboardTask;
  primary?: boolean;
  actions?: ReactNode;
}) {
  const dueLabel = task.isOverdue
    ? `已逾期 ${task.overdueDays} 天`
    : task.dueAt
      ? `${formatDate(task.dueAt)} 截止`
      : '未设置截止时间';
  const missingMaterials = task.materials.missing;

  return (
    <article className={`r22-task-card ${primary ? 'r22-task-card-primary' : ''}`}>
      <div className="r22-task-card-heading">
        <div>
          <span>{task.projectCode} · {getPriorityLabel(task.projectPriority)}</span>
          <h2>{task.nodeName}</h2>
          <p>{task.projectName}</p>
        </div>
        <R22StatusBadge tone={task.isOverdue ? 'danger' : 'brand'}>
          {task.isOverdue ? '需要处理' : '进行中'}
        </R22StatusBadge>
      </div>

      <div className="r22-task-meta">
        <span><small>截止时间</small><strong>{dueLabel}</strong></span>
        <span>
          <small>材料</small>
          <strong className={missingMaterials > 0 ? 'is-danger' : undefined}>
            {missingMaterials > 0 ? `缺 ${missingMaterials} 项` : '已齐全'}
          </strong>
        </span>
        <span><small>当前进度</small><strong>{task.completionPercent}%</strong></span>
      </div>

      <R22ProgressBar value={task.completionPercent} />

      <div className="r22-task-actions">
        {actions ?? (
          <>
            <Link href={task.progressHref} className="r22-button r22-button-primary">
              提交工作进展
            </Link>
            <Link href={task.projectHref} className="r22-button r22-button-secondary">
              查看项目
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

function getPriorityLabel(priority: ProjectPriority) {
  switch (priority) {
    case 'CRITICAL':
      return '最高优先级';
    case 'HIGH':
      return '高优先级';
    case 'LOW':
      return '低优先级';
    case 'MEDIUM':
    default:
      return '正常优先级';
  }
}
