'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

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
        <p>系统正在同步第 17 步 12 个月度评审任务。</p>
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
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">第 17 步</p>
            <h2 className="section-title">整车色差一致性评审台账</h2>
            <p className="muted">
              最近更新：{formatDateTime(payload.lastUpdatedAt)}。按项目展示 12 个月份卡片，
              突出本月任务、逾期周期和完成进度。
            </p>
          </div>
          <div className="inline-actions">
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
            description="项目完成第 16 步批量生产后，会自动生成 12 个月度评审任务。"
          />
        </section>
      ) : (
        payload.items.map((item) => (
          <section key={item.projectId} className="page-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">{item.projectCode}</p>
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
      className={`monthly-review-card monthly-review-card-${getRecurringStatusTone(task.status)}${
        isCurrentMonth(task.plannedDate) ? ' monthly-review-card-current' : ''
      }`}
    >
      <span className="workflow-node-kicker">第 {task.periodIndex} 个月</span>
      <strong>{task.periodLabel}</strong>
      <span>{getRecurringTaskStatusLabel(task.status)}</span>
      {isCurrentMonth(task.plannedDate) ? (
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

function getRecurringStatusTone(status: DashboardMonthlyReviewTask['status']) {
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
