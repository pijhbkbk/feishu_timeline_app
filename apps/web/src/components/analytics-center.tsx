'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchAnalyticsOverview,
  type AnalyticsOverview,
} from '../lib/analytics-client';
import { formatDateTime } from '../lib/projects-client';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';

export function AnalyticsCenter() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<AnalyticsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAnalytics({ initial: true });
    const timer = window.setInterval(() => {
      void loadAnalytics({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const overviewCards = useMemo(() => {
    if (!payload) {
      return [];
    }

    return [
      { label: '项目总数', value: String(payload.projectOverview.totalProjects) },
      { label: '进行中项目', value: String(payload.projectOverview.activeProjects) },
      { label: '已完成项目', value: String(payload.projectOverview.completedProjects) },
      { label: '逾期项目', value: String(payload.projectOverview.overdueProjects) },
      {
        label: '平均开发周期',
        value: `${payload.projectOverview.averageDevelopmentDays} 天`,
      },
      {
        label: '准时完成率',
        value: `${payload.workflowEfficiency.onTimeCompletionRate}%`,
      },
    ];
  }, [payload]);

  async function loadAnalytics(options?: { initial?: boolean; silent?: boolean }) {
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
      const response = await fetchAnalyticsOverview();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '数据中心加载失败。');
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
        <p className="eyebrow">数据中心</p>
        <h2 className="section-title">正在加载数据中心…</h2>
        <p>系统正在聚合项目、流程效率、评审返工、月度评审和颜色退出数据。</p>
      </section>
    );
  }

  return (
    <div className="page-stack" data-testid="analytics-page">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">经营分析</p>
            <h2 className="section-title">数据中心</h2>
            <p className="muted">
              最近更新：{formatDateTime(payload.lastUpdatedAt)}。聚合展示项目概览、流程效率、
              部门负载、评审返工、月度评审和颜色退出。
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={isRefreshing}
            onClick={() => void loadAnalytics()}
          >
            {isRefreshing ? '刷新中…' : '立即刷新'}
          </button>
        </div>
        {error ? <FeedbackBanner variant="error" title="数据刷新失败" message={error} /> : null}
        <div className="summary-grid">
          {overviewCards.map((card) => (
            <article key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">流程效率</p>
              <h2 className="section-title">18 个节点效率</h2>
            </div>
          </div>
          <WorkflowEfficiencyList payload={payload} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">部门负载</p>
              <h2 className="section-title">责任部门分析</h2>
            </div>
          </div>
          <DepartmentAnalysisList payload={payload} />
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">评审返工</p>
              <h2 className="section-title">退回原因分布</h2>
            </div>
          </div>
          <ReworkAnalysisPanel payload={payload} />
        </section>

        <section className="page-card dashboard-column">
          <div className="section-header">
            <div>
              <p className="eyebrow">关键台账</p>
              <h2 className="section-title">月度评审与颜色退出</h2>
            </div>
          </div>
          <KeyLedgerPanel payload={payload} />
        </section>
      </div>
    </div>
  );
}

export function WorkflowEfficiencyList({
  payload,
}: {
  payload: AnalyticsOverview;
}) {
  const rows = payload.workflowEfficiency.byNode.filter(
    (item) => item.averageDays > 0 || item.overdueCount > 0 || item.onTimeRate > 0,
  );

  if (rows.length === 0) {
    return (
      <StatePanel
        title="暂无流程效率数据"
        description="任务完成后，这里会按节点统计平均耗时、逾期数量和准时率。"
      />
    );
  }

  return (
    <div className="dashboard-list">
      {rows.map((item) => (
        <div key={item.nodeCode} className="distribution-row">
          <div className="distribution-copy">
            <strong>{item.nodeName}</strong>
            <span>
              平均 {item.averageDays} 天 / 逾期 {item.overdueCount} / 准时 {item.onTimeRate}%
            </span>
          </div>
          <div className="distribution-track">
            <div className="distribution-bar" style={{ width: `${Math.max(8, item.onTimeRate)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DepartmentAnalysisList({
  payload,
}: {
  payload: AnalyticsOverview;
}) {
  if (payload.departmentAnalysis.length === 0) {
    return (
      <StatePanel
        title="暂无部门负载数据"
        description="任务分配到责任部门后，这里会显示待办、逾期和准时率。"
      />
    );
  }

  return (
    <div className="dashboard-list">
      {payload.departmentAnalysis.map((item) => (
        <article key={item.departmentName} className="dashboard-list-row">
          <div>
            <strong>{item.departmentName}</strong>
            <p>待办 {item.todoCount} 项，逾期 {item.overdueCount} 项</p>
          </div>
          <div className="dashboard-list-meta">
            <span>准时率 {item.onTimeRate}%</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ReworkAnalysisPanel({
  payload,
}: {
  payload: AnalyticsOverview;
}) {
  return (
    <div className="page-stack compact">
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>退回次数</span>
          <strong>{payload.reworkAnalysis.returnCount}</strong>
        </div>
        <div className="metadata-item">
          <span>平均返工周期</span>
          <strong>{payload.reworkAnalysis.averageReworkDays} 天</strong>
        </div>
      </div>
      {payload.reworkAnalysis.reasonDistribution.length === 0 ? (
        <StatePanel title="暂无退回原因" description="出现退回或驳回后，这里会归集原因分布。" />
      ) : (
        <div className="dashboard-list">
          {payload.reworkAnalysis.reasonDistribution.map((item) => (
            <article key={item.reason} className="dashboard-list-row">
              <strong>{item.reason}</strong>
              <div className="dashboard-list-meta">
                <span>{item.count} 次</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeyLedgerPanel({
  payload,
}: {
  payload: AnalyticsOverview;
}) {
  return (
    <div className="metadata-grid">
      <div className="metadata-item">
        <span>本月待评审</span>
        <strong>{payload.monthlyReviewAnalysis.currentMonthDue}</strong>
      </div>
      <div className="metadata-item">
        <span>本月已完成</span>
        <strong>{payload.monthlyReviewAnalysis.completed}</strong>
      </div>
      <div className="metadata-item">
        <span>月度评审完成率</span>
        <strong>{payload.monthlyReviewAnalysis.completionRate}%</strong>
      </div>
      <div className="metadata-item">
        <span>建议退出颜色</span>
        <strong>{payload.colorExitAnalysis.suggestedExit}</strong>
      </div>
      <div className="metadata-item">
        <span>待人工结论</span>
        <strong>{payload.colorExitAnalysis.pending}</strong>
      </div>
      <div className="metadata-item">
        <span>开发费标准</span>
        <strong>{formatCny(payload.feeAnalysis.fixedAmount)}</strong>
      </div>
    </div>
  );
}

function formatCny(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}
