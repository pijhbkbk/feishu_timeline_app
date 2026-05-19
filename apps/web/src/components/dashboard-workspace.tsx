'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDashboardOverview,
  fetchDashboardMonthlyReviewBoard,
  fetchDashboardProjectTimelines,
  fetchDashboardRecentReviews,
  fetchDashboardRiskProjects,
  fetchDashboardStageDistribution,
  getDashboardOverviewCards,
  getReviewConclusionLabel,
  getRiskProjectSummary,
  getStageDistributionRatio,
  type DashboardWorkspacePayload,
  type RecentReviewItem,
  type RiskProjectItem,
  type StageDistributionItem,
} from '../lib/dashboard-client';
import { formatDate, formatDateTime } from '../lib/projects-client';
import { getRecurringTaskStatusLabel } from '../lib/workflows-client';
import { fetchTaskList } from '../lib/tasks-client';
import { ProjectTimelineCard } from './project-timeline-board';
import { TaskTable } from './tasks-workspace';

export function DashboardWorkspace() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<DashboardWorkspacePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard({ initial: true });
    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const cards = useMemo(
    () => (payload ? getDashboardOverviewCards(payload.overview) : []),
    [payload],
  );

  async function loadDashboard(options?: { initial?: boolean; silent?: boolean }) {
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
      const [
        overview,
        stageDistribution,
        recentReviews,
        riskProjects,
        projectTimelines,
        monthlyReviewBoard,
        myTasks,
        overdueTasks,
      ] =
        await Promise.all([
          fetchDashboardOverview(),
          fetchDashboardStageDistribution(),
          fetchDashboardRecentReviews(),
          fetchDashboardRiskProjects(),
          fetchDashboardProjectTimelines(),
          fetchDashboardMonthlyReviewBoard(),
          fetchTaskList('my', { pageSize: 5 }),
          fetchTaskList('overdue', { pageSize: 5 }),
        ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload({
        overview,
        stageDistribution,
        recentReviews,
        riskProjects,
        projectTimelines,
        monthlyReviewBoard,
        myTasks,
        overdueTasks,
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '驾驶舱加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  if (isLoading || !payload) {
    if (!isLoading && error) {
      return (
        <section className="page-card">
          <p className="eyebrow">项目进度</p>
          <h1>工作台加载失败</h1>
          <p>{error}</p>
          <div className="page-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadDashboard({ initial: true })}
            >
              重新加载
            </button>
          </div>
        </section>
      );
    }

    return <DashboardWorkspaceSkeleton />;
  }

  return (
    <div className="page-stack" data-testid="dashboard-page">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目进度</p>
            <h2 className="section-title">项目进度驾驶舱</h2>
            <p className="muted">
              最近更新：{formatDateTime(payload.overview.lastUpdatedAt)}。系统每 30 秒自动刷新，也可手动立即刷新。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadDashboard()}
            >
              {isRefreshing ? '刷新中…' : '立即刷新'}
            </button>
            <Link href="/projects/timeline" className="button button-primary">
              查看时间线看板
            </Link>
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <KPIOverviewSection cards={cards} />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目看板</p>
            <h2 className="section-title">重点项目时间线</h2>
            <p className="muted">展示最近更新项目的当前节点、责任人、进度百分比和下一步。</p>
          </div>
          <Link href="/projects/timeline" className="button button-secondary">
            打开完整看板
          </Link>
        </div>
        {payload.projectTimelines.items.length === 0 ? (
          <div className="empty-state">
            <strong>暂无项目时间线</strong>
            <p>项目创建并初始化流程后，这里会展示 18 个节点的推进情况。</p>
          </div>
        ) : (
          <div className="timeline-board-list timeline-board-list-compact">
            {payload.projectTimelines.items.slice(0, 3).map((item) => (
              <ProjectTimelineCard key={item.projectId} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">月度评审</p>
            <h2 className="section-title">整车色差一致性评审进度</h2>
            <p className="muted">
              已完成 {payload.monthlyReviewBoard.summary.completedPeriods} / {payload.monthlyReviewBoard.summary.totalPeriods}，
              本月待完成 {payload.monthlyReviewBoard.summary.currentMonthPending} 项。
            </p>
          </div>
        </div>
        <MonthlyReviewBoardSummary payload={payload.monthlyReviewBoard} />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">我的任务</p>
            <h2 className="section-title">我的待办</h2>
            <p className="muted">展示当前登录用户可直接进入处理的工作项。</p>
          </div>
          <div className="inline-actions">
            <Link href="/tasks/pending" className="button button-secondary">
              查看待处理任务
            </Link>
          </div>
        </div>
        <TaskTable items={payload.myTasks.items} />
      </section>

      <div className="dashboard-grid">
        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">阶段分布</p>
              <h2 className="section-title">阶段分布</h2>
            </div>
          </div>
          <StageDistributionList items={payload.stageDistribution} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">逾期任务</p>
              <h2 className="section-title">我的逾期任务</h2>
            </div>
            <div className="inline-actions">
              <Link href="/tasks/overdue" className="button button-secondary">
                查看全部
              </Link>
            </div>
          </div>
          <TaskTable items={payload.overdueTasks.items} />
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">最近评审</p>
              <h2 className="section-title">最近评审</h2>
            </div>
          </div>
          <RecentReviewsPanel items={payload.recentReviews} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">风险项目</p>
              <h2 className="section-title">高风险项目</h2>
            </div>
          </div>
          <RiskProjectsPanel items={payload.riskProjects} />
        </section>
      </div>
    </div>
  );
}

export function KPIOverviewSection({
  cards,
}: {
  cards: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="metric-grid">
      {cards.map((card) => (
        <article key={card.label} className="stat-card">
          <p>{card.label}</p>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  );
}

function MonthlyReviewBoardSummary({
  payload,
}: {
  payload: DashboardWorkspacePayload['monthlyReviewBoard'];
}) {
  if (payload.items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无月度评审计划</strong>
        <p>项目进入第 17 步后，12 个月度实例会自动出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-list">
      {payload.items.slice(0, 4).map((item) => (
        <article key={item.projectId} className="dashboard-list-row">
          <div>
            <strong>{item.projectName}</strong>
            <p>
              {item.colorName} · 已完成 {item.completedPeriods} / {item.totalPeriods}
            </p>
          </div>
          <div className="dashboard-list-meta">
            <span>
              本月：
              {item.currentMonthTask
                ? getRecurringTaskStatusLabel(item.currentMonthTask.status)
                : '未排期'}
            </span>
            <Link href={`/projects/${item.projectId}/reviews`} className="table-link">
              查看台账
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function StageDistributionList({
  items,
}: {
  items: StageDistributionItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无阶段统计</strong>
        <p>项目进入流程后，这里会自动聚合当前阶段分布。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-list">
      {items.map((item) => (
        <div key={item.nodeCode} className="distribution-row">
          <div className="distribution-copy">
            <strong>{item.nodeName}</strong>
            <span>{item.count} 个项目</span>
          </div>
          <div className="distribution-track">
            <div
              className="distribution-bar"
              style={{ width: `${getStageDistributionRatio(item, items)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecentReviewsPanel({
  items,
}: {
  items: RecentReviewItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无近期评审</strong>
        <p>评审节点动作执行后，这里会显示最近记录。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-list">
      {items.map((item) => (
        <article key={item.id} className="dashboard-list-row">
          <div>
            <strong>{item.projectName}</strong>
            <p>
              {item.reviewerName} · {formatDate(item.reviewDate)}
            </p>
          </div>
          <div className="dashboard-list-meta">
            <span>{getReviewConclusionLabel(item.conclusion)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RiskProjectsPanel({
  items,
}: {
  items: RiskProjectItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无高风险项目</strong>
        <p>当前没有命中逾期或高风险规则的项目。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-list">
      {items.map((item) => (
        <article key={item.projectId} className="dashboard-list-row">
          <div>
            <strong>{item.projectName}</strong>
            <p>
              {item.ownerName} · {getRiskProjectSummary(item)}
            </p>
          </div>
          <div className="dashboard-list-meta">
            <span>{item.overdueDays > 0 ? `逾期 ${item.overdueDays} 天` : '预警中'}</span>
            <Link href={`/projects/${item.projectId}/overview`} className="table-link">
              查看项目
            </Link>
            <Link href={`/projects/${item.projectId}/flow-map`} className="table-link">
              流程地图
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function DashboardWorkspaceSkeleton() {
  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="skeleton-block skeleton-title" />
        <div className="metric-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="stat-card">
              <div className="skeleton-block skeleton-text" />
              <div className="skeleton-block skeleton-number" />
            </div>
          ))}
        </div>
      </section>
      <section className="page-card">
        <div className="skeleton-block skeleton-title" />
        <div className="table-skeleton">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton-block skeleton-row" />
          ))}
        </div>
      </section>
    </div>
  );
}
