'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDashboardProjectTimelines,
  type DashboardProjectTimelineItem,
  type DashboardProjectTimelinesResponse,
} from '../lib/dashboard-client';
import { formatDate, formatDateTime } from '../lib/projects-client';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';

export function MaterialsCenter() {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<DashboardProjectTimelinesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMaterials({ initial: true });
    const timer = window.setInterval(() => {
      void loadMaterials({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const summaryCards = useMemo(() => {
    const items = payload?.items ?? [];
    const overdueCount = items.filter((item) => item.overdueDays > 0).length;
    const activeCount = items.filter((item) => item.progressPercent < 100).length;
    const reviewMonthCount = items.filter((item) => item.monthlyReview).length;

    return [
      { label: '项目总数', value: String(items.length) },
      { label: '待提交材料项目', value: String(activeCount) },
      { label: '逾期项目', value: String(overdueCount) },
      { label: '已进入月度评审', value: String(reviewMonthCount) },
    ];
  }, [payload]);

  async function loadMaterials(options?: { initial?: boolean; silent?: boolean }) {
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
      const response = await fetchDashboardProjectTimelines();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '材料中心加载失败。');
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
        <p className="eyebrow">材料中心</p>
        <h2 className="section-title">正在加载材料提交平台…</h2>
        <p>系统正在同步项目、当前工序、责任人和材料入口。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">材料提交</p>
            <h2 className="section-title">材料提交平台</h2>
            <p className="muted">
              最近更新：{formatDateTime(payload.lastUpdatedAt)}。材料按项目归档，可继续绑定到样板、
              试验、评审记录和开发报告。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadMaterials()}
            >
              {isRefreshing ? '刷新中…' : '立即刷新'}
            </button>
            <Link href="/projects" className="button button-secondary">
              项目列表
            </Link>
          </div>
        </div>
        {error ? <FeedbackBanner variant="error" title="材料刷新失败" message={error} /> : null}
        <div className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目材料</p>
            <h2 className="section-title">项目材料入口</h2>
            <p className="muted">按项目展示当前工序、责任人、截止时间和材料提交入口。</p>
          </div>
        </div>
        <MaterialsProjectTable items={payload.items} />
      </section>
    </div>
  );
}

export function MaterialsProjectTable({
  items,
}: {
  items: DashboardProjectTimelineItem[];
}) {
  if (items.length === 0) {
    return (
      <StatePanel
        title="暂无项目材料入口"
        description="项目创建并进入流程后，这里会显示项目级材料提交入口。"
      />
    );
  }

  return (
    <div className="table-shell table-shell-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>颜色</th>
            <th>当前工序</th>
            <th>负责人</th>
            <th>责任部门</th>
            <th>截止时间</th>
            <th>状态</th>
            <th>材料操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.projectId}>
              <td>
                <div className="cell-stack">
                  <strong>{item.projectName}</strong>
                  <span>{item.projectCode}</span>
                </div>
              </td>
              <td>
                <div className="cell-stack">
                  <strong>{item.colorName}</strong>
                  <span>{item.colorCode ?? '未维护色号'}</span>
                </div>
              </td>
              <td>{item.currentNodeName}</td>
              <td>{item.currentOwnerName}</td>
              <td>{item.currentDepartmentName ?? '未分配'}</td>
              <td>{formatDate(item.deadline)}</td>
              <td>
                {item.overdueDays > 0 ? (
                  <span className="status-pill status-pill-danger">
                    逾期 {item.overdueDays} 天
                  </span>
                ) : (
                  <span className="status-pill status-pill-success">推进中</span>
                )}
              </td>
              <td>
                <div className="task-actions">
                  <Link
                    href={`/projects/${item.projectId}/materials`}
                    className="button button-secondary button-small"
                  >
                    提交材料
                  </Link>
                  <Link
                    href={`/projects/${item.projectId}/workflow`}
                    className="button button-secondary button-small"
                  >
                    查看工序
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
