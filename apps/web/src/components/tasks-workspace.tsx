'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchTaskList,
  getTaskDueDateLabel,
  getTaskModeDescription,
  getTaskModeTitle,
  getTaskNodeLabel,
  getTaskPriorityLabel,
  getTaskProjectStatusLabel,
  getTaskStatusLabel,
  type TaskListItem,
  type TaskListMode,
  type TaskListResponse,
} from '../lib/tasks-client';

type TasksWorkspaceProps = {
  mode: TaskListMode;
};

type TaskTableProps = {
  items: TaskListItem[];
};

export function TasksWorkspace({ mode }: TasksWorkspaceProps) {
  const requestIdRef = useRef(0);
  const [response, setResponse] = useState<TaskListResponse | null>(null);
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage(1, { reset: true });
  }, [mode]);

  const summaryCards = useMemo(() => {
    const overdueCount = items.filter((item) => item.isOverdue).length;

    return [
      {
        label: '列表模式',
        value: getTaskModeTitle(mode),
      },
      {
        label: '已加载任务',
        value: String(items.length),
      },
      {
        label: '超期任务',
        value: String(overdueCount),
      },
      {
        label: '总任务数',
        value: String(response?.total ?? 0),
      },
    ];
  }, [items, mode, response]);

  async function loadPage(
    page: number,
    options?: {
      reset?: boolean;
    },
  ) {
    const requestId = ++requestIdRef.current;

    if (options?.reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    setError(null);

    try {
      const nextResponse = await fetchTaskList(mode, {
        page,
        pageSize: mode === 'my' ? 20 : 30,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setResponse(nextResponse);
      setItems((current) =>
        options?.reset ? nextResponse.items : [...current, ...nextResponse.items],
      );
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '任务列表加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  if (isLoading && !response) {
    return <TasksWorkspaceSkeleton />;
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Tasks</p>
            <h2 className="section-title">{getTaskModeTitle(mode)}</h2>
            <p className="muted">{getTaskModeDescription(mode)}</p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadPage(1, { reset: true })}
              disabled={isLoading}
            >
              刷新列表
            </button>
          </div>
        </div>
        <div className="metric-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="stat-card">
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Task List</p>
            <h2 className="section-title">当前任务</h2>
            <p className="muted">点击“进入项目”会跳转到对应项目详情页签。</p>
          </div>
          <div className="section-inline-meta">
            <span>{response ? `第 ${response.page} / ${response.totalPages} 页` : '未加载'}</span>
          </div>
        </div>
        <TaskTable items={items} />
        {response && response.page < response.totalPages ? (
          <div className="page-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isLoadingMore}
              onClick={() => void loadPage(response.page + 1)}
            >
              {isLoadingMore ? '正在加载…' : '加载更多'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TaskTable({ items }: TaskTableProps) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>节点</th>
            <th>任务状态</th>
            <th>负责人</th>
            <th>截止时间</th>
            <th>优先级</th>
            <th>项目状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>当前没有任务</strong>
                  <p>该列表已经和 workflow_tasks 联动，暂无符合条件的活跃任务。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.taskId}>
                <td>
                  <div className="task-table-primary">
                    <strong>{item.projectName}</strong>
                    {item.isOverdue ? <span className="overdue-badge">超期</span> : null}
                  </div>
                </td>
                <td>{getTaskNodeLabel(item)}</td>
                <td>
                  <span className="status-badge status-ready">
                    {getTaskStatusLabel(item.taskStatus)}
                  </span>
                </td>
                <td>{item.assigneeName}</td>
                <td>{getTaskDueDateLabel(item.dueAt)}</td>
                <td>{getTaskPriorityLabel(item.priority)}</td>
                <td>{getTaskProjectStatusLabel(item.currentProjectStatus)}</td>
                <td>
                  <Link href={item.projectHref} className="table-link">
                    进入项目
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TasksWorkspaceSkeleton() {
  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="skeleton-block skeleton-title" />
        <div className="metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
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
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton-block skeleton-row" />
          ))}
        </div>
      </section>
    </div>
  );
}

