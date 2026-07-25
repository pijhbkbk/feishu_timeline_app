'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import {
  fetchPersonalDashboardOverview,
  type PersonalDashboardOverview,
} from '../lib/dashboard-client';
import { formatDateTime } from '../lib/projects-client';
import { R22Card, R22Kpi, R22StatusBadge, R22TaskCard } from './r22-ui';

export function DashboardWorkspace() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<PersonalDashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard({ initial: true });
    const timer = window.setInterval(() => void loadDashboard({ silent: true }), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
      const response = await fetchPersonalDashboardOverview();
      if (requestId === requestIdRef.current) {
        setPayload(response);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : '工作台加载失败。');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  if (isLoading && !payload) {
    return <DashboardSkeleton />;
  }

  if (!payload) {
    return (
      <R22Card className="r22-state-card">
        <R22StatusBadge tone="danger">加载失败</R22StatusBadge>
        <h1>暂时无法打开工作台</h1>
        <p>{error ?? '请稍后重新加载。'}</p>
        <button className="r22-button r22-button-primary" type="button" onClick={() => void loadDashboard({ initial: true })}>
          重新加载
        </button>
      </R22Card>
    );
  }

  const { currentTask, nextTask, stats } = payload;

  return (
    <div className="r22-page r22-dashboard" data-testid="dashboard-page">
      <header className="r22-page-hero">
        <div>
          <p className="r22-overline">今天的工作</p>
          <h1>{getGreeting()}，{payload.user.name}</h1>
          <p>今天有 {stats.activeTasks} 项任务需要处理，其中 {stats.dueTodayTasks} 项今天到期。</p>
        </div>
        <div className="r22-page-hero-actions">
          <span>更新于 {formatDateTime(payload.generatedAt)}</span>
          {currentTask ? (
            <Link href={currentTask.progressHref} className="r22-button r22-button-primary">
              处理下一项任务
            </Link>
          ) : null}
          <button
            type="button"
            className="r22-icon-button r22-refresh-button"
            aria-label="刷新工作台"
            disabled={isRefreshing}
            onClick={() => void loadDashboard()}
          >
            {isRefreshing ? '…' : '↻'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="r22-inline-alert" role="status">
          <span>部分数据刷新失败，当前仍展示上一次成功结果。</span>
          <button type="button" onClick={() => void loadDashboard()}>重试</button>
        </div>
      ) : null}

      <section className="r22-dashboard-focus" aria-label="当前工作重点">
        <div>
          <div className="r22-section-heading">
            <div>
              <p className="r22-overline">现在要做</p>
              <h2>当前任务</h2>
            </div>
            <Link href="/tasks" className="r22-text-link">查看全部任务</Link>
          </div>
          {currentTask ? (
            <R22TaskCard task={currentTask} primary />
          ) : (
            <R22Card className="r22-empty-focus">
              <span className="r22-empty-icon" aria-hidden="true">✓</span>
              <h2>当前没有待处理任务</h2>
              <p>新的工序分配后会立即出现在这里。</p>
              <Link href="/projects" className="r22-button r22-button-secondary">查看项目</Link>
            </R22Card>
          )}
        </div>

        <aside className="r22-next-panel">
          <div className="r22-section-heading">
            <div>
              <p className="r22-overline">接下来</p>
              <h2>下一项任务</h2>
            </div>
          </div>
          {nextTask ? (
            <article className="r22-next-task">
              <R22StatusBadge tone={nextTask.isOverdue ? 'danger' : 'neutral'}>
                {nextTask.isOverdue ? '已逾期' : '待处理'}
              </R22StatusBadge>
              <h3>{nextTask.nodeName}</h3>
              <p>{nextTask.projectName}</p>
              <dl>
                <div><dt>进度</dt><dd>{nextTask.completionPercent}%</dd></div>
                <div><dt>材料</dt><dd>{nextTask.materials.missing > 0 ? `缺 ${nextTask.materials.missing} 项` : '已齐全'}</dd></div>
              </dl>
              <Link href={nextTask.progressHref} className="r22-button r22-button-secondary">打开任务</Link>
            </article>
          ) : (
            <article className="r22-next-task r22-next-task-empty">
              <span aria-hidden="true">○</span>
              <h3>暂无下一项</h3>
              <p>专注完成当前任务即可。</p>
            </article>
          )}
        </aside>
      </section>

      <section className="r22-kpi-grid" aria-label="个人工作统计">
        <R22Kpi label="今天到期" value={stats.dueTodayTasks} hint="今天需要交付" tone="warning" />
        <R22Kpi label="待我评审" value={stats.pendingReviewTasks} hint="需要我给出结论" tone="brand" />
        <R22Kpi label="待补材料" value={stats.pendingMaterialTasks} hint="必交材料尚未齐全" tone={stats.pendingMaterialTasks > 0 ? 'danger' : 'success'} />
        <R22Kpi label="等待他人" value={stats.waitingOnOthersTasks} hint="已记录协助人的阻塞" tone="neutral" />
      </section>

      <R22Card className="r22-activity-card">
        <div className="r22-section-heading">
          <div>
            <p className="r22-overline">最近发生</p>
            <h2>项目动态</h2>
          </div>
          <Link href="/projects" className="r22-text-link">进入项目列表</Link>
        </div>
        {payload.recentActivity.length > 0 ? (
          <div className="r22-activity-list">
            {payload.recentActivity.map((activity) => (
              <article key={activity.id}>
                <span className="r22-activity-dot" aria-hidden="true" />
                <div>
                  <strong>{activity.summary}</strong>
                  <p>{activity.projectName} · {activity.actorName}</p>
                </div>
                <time>{formatRelativeTime(activity.createdAt)}</time>
              </article>
            ))}
          </div>
        ) : (
          <p className="r22-muted">暂无项目动态。</p>
        )}
      </R22Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="r22-page r22-dashboard r22-skeleton-page" aria-label="正在加载工作台">
      <div className="r22-skeleton r22-skeleton-title" />
      <div className="r22-skeleton r22-skeleton-hero" />
      <div className="r22-kpi-grid">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="r22-skeleton r22-skeleton-kpi" />)}
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
