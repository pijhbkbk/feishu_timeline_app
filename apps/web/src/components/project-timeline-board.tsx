'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDashboardProjectTimelines,
  type DashboardProjectTimelineItem,
  type DashboardProjectTimelinesResponse,
} from '../lib/dashboard-client';
import {
  formatDate,
  formatDateTime,
  getProjectStatusLabel,
  type ProjectStatus,
} from '../lib/projects-client';
import {
  getTimelineNodeStatusLabel,
  getTimelineNodeTone,
} from '../lib/status-labels';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';

type ProjectTimelineBoardProps = {
  embedded?: boolean;
  maxItems?: number;
};

type TimelineBoardFilters = {
  keyword: string;
  projectStatus: ProjectStatus | '';
  departmentName: string;
  ownerName: string;
  onlyOverdue: boolean;
};

export function ProjectTimelineBoard({
  embedded = false,
  maxItems,
}: ProjectTimelineBoardProps) {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<DashboardProjectTimelinesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TimelineBoardFilters>({
    keyword: '',
    projectStatus: '',
    departmentName: '',
    ownerName: '',
    onlyOverdue: false,
  });

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
      const response = await fetchDashboardProjectTimelines();

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '项目时间线看板加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  const filterOptions = useMemo(() => {
    const items = payload?.items ?? [];
    return {
      departments: uniqueOptions(items.map((item) => item.currentDepartmentName).filter(Boolean)),
      owners: uniqueOptions(items.map((item) => item.currentOwnerName).filter(Boolean)),
      statuses: uniqueOptions(items.map((item) => item.projectStatus).filter(Boolean)),
    };
  }, [payload]);

  const visibleItems = useMemo(() => {
    const items = payload?.items ?? [];
    const keyword = filters.keyword.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const keywordMatched =
        !keyword ||
        [
          item.projectName,
          item.projectCode,
          item.colorName,
          item.colorCode ?? '',
          item.currentNodeName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      const statusMatched =
        !filters.projectStatus || item.projectStatus === filters.projectStatus;
      const departmentMatched =
        !filters.departmentName || item.currentDepartmentName === filters.departmentName;
      const ownerMatched = !filters.ownerName || item.currentOwnerName === filters.ownerName;
      const overdueMatched = !filters.onlyOverdue || item.overdueDays > 0;

      return (
        keywordMatched &&
        statusMatched &&
        departmentMatched &&
        ownerMatched &&
        overdueMatched
      );
    });

    return maxItems ? filtered.slice(0, maxItems) : filtered;
  }, [filters, maxItems, payload]);

  if (isLoading || !payload) {
    return (
      <section className="page-card timeline-board-shell">
        <p className="eyebrow">项目时间线</p>
        <h2 className="section-title">正在加载项目时间线看板…</h2>
        <p>项目节点、责任人、截止时间和逾期状态正在同步。</p>
      </section>
    );
  }

  return (
    <section className="page-card timeline-board-shell" data-testid="project-timeline-board">
      <div className="section-header">
        <div>
          <p className="eyebrow">项目进度</p>
          <h2 className="section-title">项目时间线看板</h2>
          <p className="muted">
            最近更新：{formatDateTime(payload.lastUpdatedAt)}。每张卡片按 18 个流程节点展示当前进度、逾期状态和下一步。
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
          {embedded ? (
            <Link href="/projects/timeline" className="button button-primary">
              打开完整看板
            </Link>
          ) : (
            <Link href="/dashboard" className="button button-secondary">
              返回驾驶舱
            </Link>
          )}
        </div>
      </div>
      {error ? <FeedbackBanner variant="error" title="看板刷新失败" message={error} /> : null}
      {!embedded ? (
        <TimelineBoardFilterBar
          value={filters}
          departments={filterOptions.departments}
          owners={filterOptions.owners}
          statuses={filterOptions.statuses}
          onChange={setFilters}
        />
      ) : null}
      {visibleItems.length === 0 ? (
        <StatePanel
          title="暂无可展示项目"
          description="项目创建后，系统会自动在这里展示 18 个流程节点的推进情况。"
        />
      ) : (
        <div className="timeline-board-list">
          {visibleItems.map((item) => (
            <ProjectTimelineCard key={item.projectId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectTimelineCard({ item }: { item: DashboardProjectTimelineItem }) {
  return (
    <article className="timeline-board-card" data-testid="project-timeline-card">
      <div className="timeline-board-card-header">
        <div>
          <span className="workflow-node-kicker">{item.projectCode}</span>
          <h3>{item.projectName}</h3>
          <p>
            颜色：{item.colorName} / 当前节点：{item.currentNodeName}
          </p>
        </div>
        <div className="progress-ring" aria-label={`进度 ${item.progressPercent}%`}>
          <strong>{item.progressPercent}%</strong>
          <span>进度</span>
        </div>
      </div>
      <div className="timeline-board-meta">
        <div>
          <span>当前责任人</span>
          <strong>{item.currentOwnerName}</strong>
        </div>
        <div>
          <span>责任部门</span>
          <strong>{item.currentDepartmentName ?? '未分配'}</strong>
        </div>
        <div>
          <span>截止时间</span>
          <strong>{formatDate(item.deadline)}</strong>
        </div>
        <div className={item.overdueDays > 0 ? 'timeline-meta-danger' : undefined}>
          <span>逾期天数</span>
          <strong>{item.overdueDays > 0 ? `${item.overdueDays} 天` : '未逾期'}</strong>
        </div>
        <div>
          <span>下一步</span>
          <strong>{item.nextStep}</strong>
        </div>
      </div>
      <div className="timeline-board-nodes" aria-label={`${item.projectName} 18 个流程节点`}>
        {item.nodes.map((node) => (
          <div
            key={node.nodeCode}
            className={`timeline-board-node timeline-board-node-${getTimelineNodeTone(
              node.timelineStatus,
            )}`}
          >
            <span className="timeline-board-step">{String(node.stepNumber).padStart(2, '0')}</span>
            <strong>{node.nodeName}</strong>
            <small>{getTimelineNodeStatusLabel(node.timelineStatus)}</small>
            {node.isOverdue ? <em>逾期 {node.overdueDays} 天</em> : null}
          </div>
        ))}
      </div>
      <div className="timeline-board-footer">
        <span>
          看板更新时间：{formatDateTime(item.updatedAt)}
          {item.monthlyReview
            ? ` / 第 17 步月度评审 ${item.monthlyReview.completedPeriods}/${item.monthlyReview.totalPeriods}`
            : ''}
        </span>
        <div className="task-actions">
          <Link
            href={`/projects/${item.projectId}/overview`}
            className="button button-secondary button-small"
          >
            查看详情
          </Link>
          <Link
            href={`/projects/${item.projectId}/workflow`}
            className="button button-secondary button-small"
          >
            流程时间线
          </Link>
        </div>
      </div>
    </article>
  );
}

export function TimelineBoardFilterBar({
  value,
  departments,
  owners,
  statuses,
  onChange,
}: {
  value: TimelineBoardFilters;
  departments: string[];
  owners: string[];
  statuses: string[];
  onChange: (value: TimelineBoardFilters) => void;
}) {
  return (
    <div className="filters-grid timeline-board-filters">
      <label className="field">
        <span>关键词</span>
        <input
          value={value.keyword}
          placeholder="搜索项目、颜色、当前节点"
          onChange={(event) => onChange({ ...value, keyword: event.target.value })}
        />
      </label>
      <label className="field">
        <span>项目状态</span>
        <select
          value={value.projectStatus}
          onChange={(event) =>
            onChange({ ...value, projectStatus: event.target.value as ProjectStatus | '' })
          }
        >
          <option value="">全部状态</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {getProjectStatusLabel(status as ProjectStatus)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>责任部门</span>
        <select
          value={value.departmentName}
          onChange={(event) => onChange({ ...value, departmentName: event.target.value })}
        >
          <option value="">全部部门</option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>负责人</span>
        <select
          value={value.ownerName}
          onChange={(event) => onChange({ ...value, ownerName: event.target.value })}
        >
          <option value="">全部负责人</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </label>
      <label className="field checkbox-field">
        <span>只看逾期</span>
        <input
          type="checkbox"
          checked={value.onlyOverdue}
          onChange={(event) => onChange({ ...value, onlyOverdue: event.target.checked })}
        />
      </label>
    </div>
  );
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
}
