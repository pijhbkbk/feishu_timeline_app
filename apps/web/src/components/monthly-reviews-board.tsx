'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import { formatBusinessCode } from '../lib/business-code';
import {
  fetchDashboardMonthlyReviewBoard,
  type DashboardMonthlyReviewBoardResponse,
  type DashboardMonthlyReviewTask,
} from '../lib/dashboard-client';
import { formatDate, formatDateTime } from '../lib/projects-client';
import {
  getRecurringTaskStatusLabel,
  getReviewResultLabel,
} from '../lib/workflows-client';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';

export function MonthlyReviewsBoard() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<DashboardMonthlyReviewBoardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadBoard({ initial: true });
    const timer = window.setInterval(() => {
      void loadBoard({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  async function loadBoard(options?: { initial?: boolean; silent?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else if (!options?.silent) {
      setIsRefreshing(true);
    }

    if (!options?.silent) {
      setError(null);
    }

    try {
      const response = await fetchDashboardMonthlyReviewBoard();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '月度评审台账加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  if (isLoading || !payload) {
    return (
      <section className="page-card">
        <p className="eyebrow">月度评审</p>
        <h2 className="section-title">正在加载整车色差一致性评审台账…</h2>
        <p>正在读取历史月度记录。当前周评按实际抽检登记。</p>
      </section>
    );
  }

  const summaryCards = [
    { label: '项目数', value: String(payload.summary.projectCount) },
    { label: '周期总数', value: String(payload.summary.totalPeriods) },
    { label: '已完成', value: String(payload.summary.completedPeriods) },
    { label: '已逾期', value: String(payload.summary.overduePeriods) },
    { label: '本月待评审', value: String(payload.summary.currentMonthPending) },
  ];

  return (
    <div className="page-stack" data-testid="monthly-review-board">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">第 17 步</p>
            <h2 className="section-title">历史月度评审台账</h2>
            <p className="muted">
              最近更新：{formatDateTime(payload.lastUpdatedAt)}。保留原月份记录；没有明确实际抽检关联的期次不计当前待办或逾期。
            </p>
          </div>
          <div className="inline-actions">
            <Link href="/inspections" className="button button-secondary">登记实际周评</Link>
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadBoard()}
            >
              {isRefreshing ? '刷新中…' : '立即刷新'}
            </button>
            <Link href="/dashboard" className="button button-secondary">
              返回驾驶舱
            </Link>
          </div>
        </div>
        {error ? <FeedbackBanner variant="error" title="台账刷新失败" message={error} /> : null}
        <div className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      {payload.items.length === 0 ? (
        <section className="page-card">
          <StatePanel
            title="暂无月度评审计划"
            description="当前周评按实际抽检组织，不为未抽检颜色自动生成月度任务。"
          />
        </section>
      ) : (
        payload.items.map((item) => (
          <section key={item.projectId} className="page-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">{formatBusinessCode(item.projectCode, '定制色项目')}</p>
                <h3 className="section-title">{item.projectName}</h3>
                <p className="muted">
                  颜色：{item.colorName}。负责人：{item.ownerName}。已完成{' '}
                  {item.completedPeriods} / {item.totalPeriods}，逾期 {item.overduePeriods}。
                </p>
              </div>
              <Link href={`/projects/${item.projectId}/reviews`} className="button button-secondary">
                查看项目评审
              </Link>
            </div>
            <div className="monthly-review-grid" data-testid="monthly-review-board-grid">
              {item.months.map((task) => (
                <MonthlyReviewMonthCard
                  key={task.id}
                  projectId={item.projectId}
                  task={task}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export function MonthlyReviewMonthCard({
  projectId,
  task,
}: {
  projectId: string;
  task: DashboardMonthlyReviewTask;
}) {
  return (
    <Link
      href={`/projects/${projectId}/reviews?recurringTaskId=${task.id}`}
      className={`monthly-review-card monthly-review-card-${getRecurringStatusTone(task.status, task.hasRecordedSampling)}${
        task.hasRecordedSampling && isCurrentMonth(task.plannedDate) ? ' monthly-review-card-current' : ''
      }`}
    >
      <span className="workflow-node-kicker">第 {task.periodIndex} 个月</span>
      <strong>{task.periodLabel}</strong>
      <span>{task.hasRecordedSampling || task.status === 'COMPLETED' ? getRecurringTaskStatusLabel(task.status) : `未登记实际抽检；历史状态：${getRecurringTaskStatusLabel(task.status)}`}</span>
      {task.hasRecordedSampling && isCurrentMonth(task.plannedDate) ? (
        <span className="status-pill status-pill-warning">本月任务</span>
      ) : null}
      <span>计划：{formatDate(task.plannedDate)}</span>
      <span>截止：{formatDate(task.dueAt)}</span>
      <span>完成：{formatDate(task.completedAt)}</span>
      <span>结论：{getReviewResultLabel(task.result)}</span>
      <span className="table-link">查看详情</span>
    </Link>
  );
}

function getRecurringStatusTone(status: DashboardMonthlyReviewTask['status'], hasRecordedSampling?: boolean) {
  if (!hasRecordedSampling && status !== 'COMPLETED') return 'pending';
  switch (status) {
    case 'COMPLETED':
      return 'completed';
    case 'OVERDUE':
      return 'overdue';
    case 'IN_PROGRESS':
      return 'active';
    default:
      return 'pending';
  }
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
