'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchProjectLogs,
  formatProjectLogTargetDate,
  formatProjectLogTimestamp,
  getProjectLogActorLabel,
  getProjectLogNodeLabel,
  getProjectLogSourceLabel,
  type ProjectLogItem,
  type ProjectLogsResponse,
  type ProjectLogSourceType,
} from '../lib/project-logs-client';

type ProjectLogsWorkspaceProps = {
  projectId: string;
};

const SOURCE_FILTERS: Array<{
  value: 'ALL' | ProjectLogSourceType;
  label: string;
}> = [
  { value: 'ALL', label: '全部' },
  { value: 'WORKFLOW', label: '流程流转' },
  { value: 'AUDIT', label: '审计日志' },
  { value: 'NOTIFICATION', label: '通知' },
];

export function ProjectLogsWorkspace({
  projectId,
}: ProjectLogsWorkspaceProps) {
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<ProjectLogsResponse | null>(null);
  const [filter, setFilter] = useState<'ALL' | ProjectLogSourceType>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLogs({ initial: true });
  }, [projectId]);

  async function loadLogs(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const nextPayload = await fetchProjectLogs(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPayload(nextPayload);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '项目日志加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  const filteredItems = useMemo(() => {
    if (!payload) {
      return [];
    }

    return filter === 'ALL'
      ? payload.items
      : payload.items.filter((item) => item.sourceType === filter);
  }, [filter, payload]);

  if (isLoading || !payload) {
    return (
      <section className="page-card">
        <p className="eyebrow">Project Logs</p>
        <h1>正在加载项目日志…</h1>
        <p>流程流转、审计动作和通知记录正在聚合。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Project Logs</p>
            <h2 className="section-title">{payload.project.name}</h2>
            <p className="muted">
              当前节点 {payload.project.currentNodeName ?? '未开始'}，目标日期{' '}
              {formatProjectLogTargetDate(payload.project.targetDate)}。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadLogs()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              查看流程
            </Link>
          </div>
        </div>
        <div className="metric-grid">
          <article className="stat-card">
            <p>总记录数</p>
            <strong>{payload.summary.totalCount}</strong>
          </article>
          <article className="stat-card">
            <p>流程流转</p>
            <strong>{payload.summary.workflowCount}</strong>
          </article>
          <article className="stat-card">
            <p>审计日志</p>
            <strong>{payload.summary.auditCount}</strong>
          </article>
          <article className="stat-card">
            <p>通知记录</p>
            <strong>{payload.summary.notificationCount}</strong>
          </article>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2 className="section-title">项目时间线</h2>
            <p className="muted">统一查看流程流转、业务审计和系统通知，便于联调追溯。</p>
          </div>
        </div>
        <ProjectLogFilterBar filter={filter} onChange={setFilter} />
        <ProjectLogTimelineList items={filteredItems} />
      </section>
    </div>
  );
}

export function ProjectLogFilterBar({
  filter,
  onChange,
}: {
  filter: 'ALL' | ProjectLogSourceType;
  onChange: (value: 'ALL' | ProjectLogSourceType) => void;
}) {
  return (
    <div className="pill-filter-row">
      {SOURCE_FILTERS.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`pill-filter ${filter === item.value ? 'pill-filter-active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ProjectLogTimelineList({
  items,
}: {
  items: ProjectLogItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>暂无日志记录</strong>
        <p>业务动作发生后，这里会自动聚合流程、审计和通知信息。</p>
      </div>
    );
  }

  return (
    <div className="timeline-list">
      {items.map((item) => (
        <article key={item.id} className="timeline-card">
          <div className="timeline-header">
            <div className="cell-stack">
              <div className="log-title-row">
                <strong>{item.title}</strong>
                <ProjectLogSourceBadge sourceType={item.sourceType} />
              </div>
              <span>{item.description}</span>
            </div>
            <span>{formatProjectLogTimestamp(item.createdAt)}</span>
          </div>
          <p className="timeline-comment">
            操作人 {getProjectLogActorLabel(item)}
            {item.nodeCode ? ` · 节点 ${getProjectLogNodeLabel(item)}` : ''}
            {item.sourceType === 'NOTIFICATION' && item.isRead !== null
              ? ` · ${item.isRead ? '已读' : '未读'}`
              : ''}
            {item.sourceType === 'NOTIFICATION' && item.sendStatus
              ? ` · ${item.sendStatus}`
              : ''}
          </p>
          {item.linkPath ? (
            <div className="page-actions">
              <Link href={item.linkPath} className="table-link">
                打开关联页面
              </Link>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ProjectLogSourceBadge({
  sourceType,
}: {
  sourceType: ProjectLogSourceType;
}) {
  return (
    <span className="status-badge status-ready">
      {getProjectLogSourceLabel(sourceType)}
    </span>
  );
}
