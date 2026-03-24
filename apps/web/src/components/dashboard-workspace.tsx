'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDashboardOverview,
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
import { formatDate } from '../lib/projects-client';
import { fetchTaskList } from '../lib/tasks-client';
import { TaskTable } from './tasks-workspace';

export function DashboardWorkspace() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<DashboardWorkspacePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard({ initial: true });
  }, []);

  const cards = useMemo(
    () => (payload ? getDashboardOverviewCards(payload.overview) : []),
    [payload],
  );

  async function loadDashboard(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const [overview, stageDistribution, recentReviews, riskProjects, myTasks, overdueTasks] =
        await Promise.all([
          fetchDashboardOverview(),
          fetchDashboardStageDistribution(),
          fetchDashboardRecentReviews(),
          fetchDashboardRiskProjects(),
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
        myTasks,
        overdueTasks,
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Dashboard 加载失败。');
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
          <p className="eyebrow">Dashboard</p>
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
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2 className="section-title">首页工作台</h2>
            <p className="muted">以当前登录用户视角聚合项目、任务、评审和风险信息。</p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadDashboard()}
            >
              {isRefreshing ? '正在刷新…' : '刷新数据'}
            </button>
            <Link href="/tasks/my" className="button button-primary">
              查看我的待办
            </Link>
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <KPIOverviewSection cards={cards} />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">My Tasks</p>
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
              <p className="eyebrow">Stage Distribution</p>
              <h2 className="section-title">阶段分布</h2>
            </div>
          </div>
          <StageDistributionList items={payload.stageDistribution} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">Overdue</p>
              <h2 className="section-title">我的超期任务</h2>
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
              <p className="eyebrow">Recent Reviews</p>
              <h2 className="section-title">最近评审</h2>
            </div>
          </div>
          <RecentReviewsPanel items={payload.recentReviews} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">Risk Projects</p>
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
        <p>当前没有命中超期或高风险规则的项目。</p>
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
            <span>{item.overdueDays > 0 ? `超期 ${item.overdueDays} 天` : '预警中'}</span>
            <Link href={`/projects/${item.projectId}/overview`} className="table-link">
              查看项目
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
          {Array.from({ length: 6 }).map((_, index) => (
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
