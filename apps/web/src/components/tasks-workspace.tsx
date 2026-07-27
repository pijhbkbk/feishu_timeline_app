'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import {
  fetchTaskList,
  getTaskDueDateLabel,
  getTaskNodeLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  type TaskListItem,
  type TaskListMode,
  type TaskListResponse,
} from '../lib/tasks-client';
import { R22ProgressBar, R22StatusBadge } from './r22-ui';

type TasksWorkspaceProps = { mode: TaskListMode };

const FILTERS: Array<{ mode: Exclude<TaskListMode, 'my'>; label: string }> = [
  { mode: 'pending', label: '待处理' },
  { mode: 'review', label: '待评审' },
  { mode: 'due-soon', label: '即将到期' },
  { mode: 'overdue', label: '已逾期' },
  { mode: 'completed', label: '已完成' },
];

export function TasksWorkspace({ mode }: TasksWorkspaceProps) {
  const requestIdRef = useRef(0);
  const [activeMode, setActiveMode] = useState<TaskListMode>(mode === 'my' ? 'pending' : mode);
  const [response, setResponse] = useState<TaskListResponse | null>(null);
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextMode = mode === 'my' ? 'pending' : mode;
    setActiveMode(nextMode);
    void loadPage(nextMode, 1);
  }, [mode]);

  async function loadPage(nextMode: TaskListMode, page: number) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchTaskList(nextMode, { page, pageSize: 20 });
      if (requestId !== requestIdRef.current) return;
      setResponse(next);
      setItems(next.items);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : '任务列表加载失败。');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  async function selectMode(nextMode: TaskListMode) {
    setActiveMode(nextMode);
    await loadPage(nextMode, 1);
  }

  return (
    <div className="r22-page r22-tasks-page" data-testid="tasks-page">
      <header className="r22-page-hero">
        <div><p className="r22-overline">我的任务</p><h1>今天要推进什么</h1><p>按处理类型聚合真实工序任务，先处理阻塞、评审和临期事项。</p></div>
        <button type="button" className="r22-button r22-button-secondary" disabled={isLoading} onClick={() => void loadPage(activeMode, response?.page ?? 1)}>刷新任务</button>
      </header>

      <div className="r22-board-controls">
        <div className="r22-segmented" role="tablist" aria-label="任务筛选">
          {FILTERS.map((item) => <button key={item.mode} type="button" role="tab" aria-selected={activeMode === item.mode} className={activeMode === item.mode ? 'is-active' : undefined} onClick={() => void selectMode(item.mode)}>{item.label}</button>)}
        </div>
        <span className="r22-result-count">{response ? `${response.total} 项任务` : '正在读取任务'}</span>
      </div>

      {error ? <div className="r22-inline-alert"><span>{error}</span><button type="button" onClick={() => void loadPage(activeMode, 1)}>重新加载</button></div> : null}
      {isLoading && !response ? <TaskSkeleton /> : null}
      {!isLoading && !error && items.length === 0 ? <section className="r22-card r22-empty-focus"><span className="r22-empty-icon">✓</span><h2>这个列表已经清空</h2><p>当前没有符合条件的任务。</p><Link href="/projects" className="r22-button r22-button-secondary">查看项目</Link></section> : null}

      <section className="r22-task-card-list" aria-busy={isLoading}>
        {items.map((item) => <TaskWideCard key={item.taskId} item={item} completed={activeMode === 'completed'} />)}
      </section>

      {response && response.totalPages > 1 ? <nav className="r22-pagination" aria-label="任务分页"><button type="button" className="r22-button r22-button-secondary" disabled={response.page <= 1 || isLoading} onClick={() => void loadPage(activeMode, response.page - 1)}>上一页</button><span>第 {response.page} / {response.totalPages} 页</span><button type="button" className="r22-button r22-button-secondary" disabled={response.page >= response.totalPages || isLoading} onClick={() => void loadPage(activeMode, response.page + 1)}>下一页</button></nav> : null}
    </div>
  );
}

export function TaskWideCard({ item, completed }: { item: TaskListItem; completed: boolean }) {
  const action = getTaskAction(item, completed);
  const tone = completed ? 'success' : item.isOverdue || item.blocker?.status === 'OPEN' ? 'danger' : 'brand';
  return (
    <article className="r22-card r22-task-wide-card" data-testid="task-card">
      <div className="r22-task-wide-heading">
        <div><span>{item.projectName} · {getTaskPriorityLabel(item.priority)}</span><h2>{getTaskNodeLabel(item)}</h2><p>{getTaskStatusLabel(item.taskStatus)} · {item.assigneeName}</p></div>
        <R22StatusBadge tone={tone}>{completed ? '已完成' : item.isOverdue ? '已逾期' : item.blocker?.status === 'OPEN' ? '有阻塞' : '待推进'}</R22StatusBadge>
      </div>
      <div className="r22-task-wide-body">
        <div className="r22-task-delivery">
          <span>交付状态</span>
          <strong>{getTaskDueDateLabel(item.dueAt)}</strong>
          <p>{item.materialCount > 0 ? `已上传 ${item.materialCount} 份材料` : '当前工序尚未上传材料'}</p>
          <R22ProgressBar value={completed ? 100 : item.completionPercent} />
        </div>
        <div className="r22-task-latest">
          <span>最近进展</span>
          <strong>{item.latestUpdate?.content ?? (completed ? '任务已经完成' : '等待首次进展提交')}</strong>
          <p>{item.blocker?.description ?? item.latestUpdate?.nextPlan ?? '暂无额外说明'}</p>
          {item.latestUpdate ? <time>{formatRelativeDate(item.latestUpdate.createdAt)}</time> : null}
        </div>
      </div>
      <div className="r22-task-wide-actions">
        <Link href={action.href} className="r22-button r22-button-primary">{action.label}</Link>
        {!completed ? <Link href={`/materials/upload?taskId=${item.taskId}`} className="r22-button r22-button-secondary">上传材料</Link> : null}
        <Link href={`/projects/${item.projectId}`} className="r22-text-link">查看项目</Link>
      </div>
    </article>
  );
}

function getTaskAction(item: TaskListItem, completed: boolean) {
  if (completed) return { label: '查看完成记录', href: `/projects/${item.projectId}` };
  if (item.nodeCode === 'SAMPLE_COLOR_CONFIRMATION' || item.nodeCode === 'CAB_REVIEW' || item.nodeCode === 'COLOR_CONSISTENCY_REVIEW') return { label: '开始评审', href: item.projectHref };
  if (item.nodeCode === 'DEVELOPMENT_ACCEPTANCE') return { label: '处理收费', href: item.projectHref };
  if (item.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') return { label: '填写月度评审', href: item.projectHref };
  if (item.nodeCode === 'PROJECT_CLOSED') return { label: '确认退出结论', href: item.projectHref };
  return { label: '打开工序', href: item.projectHref };
}

function formatRelativeDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '更新时间未知';
  const hours = Math.max(0, Math.round((Date.now() - time) / 3_600_000));
  if (hours < 1) return '刚刚更新';
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.round(hours / 24)} 天前更新`;
}

function TaskSkeleton() {
  return <section className="r22-task-card-list" aria-label="正在加载任务"><div className="r22-card r22-task-wide-card r22-skeleton-card" /><div className="r22-card r22-task-wide-card r22-skeleton-card" /></section>;
}
