'use client';

import { M1RecordReturn } from '../features/m1/record-return';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';
import {
  fetchMonthlyReviewTaskDetail,
  fetchMonthlyReviewWorkspace,
  getRecurringPlanStatusLabel,
  getRecurringTaskStatusLabel,
  getReviewResultLabel,
  type MonthlyReviewTaskDetailResponse,
  type MonthlyReviewWorkspaceResponse,
} from '../lib/workflows-client';
import { formatDate, formatDateTime, getWorkflowNodeLabel } from '../lib/projects-client';

type MonthlyReviewWorkspaceProps = {
  projectId: string;
};

export function MonthlyReviewWorkspace({ projectId }: MonthlyReviewWorkspaceProps) {
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<MonthlyReviewWorkspaceResponse | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MonthlyReviewTaskDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
    const timer = window.setInterval(() => {
      void loadWorkspace({ silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.recurringTasks.length) {
      setSelectedTaskId(null);
      setDetail(null);
      return;
    }

    const nextTaskId =
      selectedTaskId && workspace.recurringTasks.some((task) => task.id === selectedTaskId)
        ? selectedTaskId
        : workspace.recurringTasks[0]?.id ?? null;

    if (nextTaskId !== selectedTaskId) {
      setSelectedTaskId(nextTaskId);
      return;
    }

    if (nextTaskId) {
      void loadDetail(nextTaskId);
    }
  }, [selectedTaskId, workspace]);

  async function loadWorkspace(options?: { initial?: boolean; silent?: boolean }) {
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
      const response = await fetchMonthlyReviewWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
      setLastUpdatedAt(new Date().toISOString());
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

  async function loadDetail(recurringTaskId: string) {
    const requestId = ++detailRequestIdRef.current;
    setIsLoadingDetail(true);
    setDetailError(null);

    try {
      const response = await fetchMonthlyReviewTaskDetail(projectId, recurringTaskId);

      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      setDetail(response);
    } catch (loadError) {
      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      setDetailError(loadError instanceof Error ? loadError.message : '月度评审详情加载失败。');
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setIsLoadingDetail(false);
      }
    }
  }

  if (isLoading || !workspace) {
    return (
      <section className="page-card">
        <p className="eyebrow">月度评审台账</p>
        <h2 className="section-title">正在加载月度评审台账…</h2>
        <p>正在同步历史周期计划与评审记录。当前周评按实际抽检登记。</p>
      </section>
    );
  }

  const summaryCards = [
    { label: '周期总数', value: String(workspace.summary.totalPeriods) },
    { label: '已完成', value: String(workspace.summary.completedPeriods) },
    { label: '逾期', value: String(workspace.summary.overduePeriods) },
    { label: '待处理', value: String(workspace.summary.pendingPeriods) },
  ];
  const selectedTask = detail?.recurringTask ?? null;

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">月度评审台账</p>
            <h2 className="section-title">历史月度评审台账</h2>
            <p className="muted">
              保留原有期次，已完成 {workspace.summary.completedPeriods} / {workspace.summary.totalPeriods}。未登记实际抽检的期次不作为当前待办或逾期。
              最近更新：{formatDateTime(lastUpdatedAt)}。
            </p>
          </div>
          <div className="inline-actions">
            <Link href="/inspections" className="button button-secondary">登记实际周评</Link>
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadWorkspace()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <M1RecordReturn projectId={projectId} />
          </div>
        </div>
        {error ? <FeedbackBanner variant="error" title="台账加载失败" message={error} /> : null}
        <div className="summary-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
        <div className="metadata-grid">
          <div className="metadata-item">
            <span>项目节点</span>
            <strong>{getWorkflowNodeLabel(workspace.project.currentNodeCode)}</strong>
          </div>
          <div className="metadata-item">
            <span>周期状态</span>
            <strong>
              {workspace.recurringPlan
                ? getRecurringPlanStatusLabel(workspace.recurringPlan.status)
                : '未生成'}
            </strong>
          </div>
          <div className="metadata-item">
            <span>周期范围</span>
            <strong>
              {workspace.recurringPlan
                ? `${formatDate(workspace.recurringPlan.startDate)} - ${formatDate(workspace.recurringPlan.endDate)}`
                : '无固定月度周期'}
            </strong>
          </div>
          <div className="metadata-item">
            <span>活跃流程任务</span>
            <strong>{workspace.activeWorkflowTask?.nodeName ?? '当前无活跃第 17 步任务'}</strong>
          </div>
        </div>
        <FeedbackBanner
          variant="info"
          compact
          title="实例绑定规则"
          message="此处保留历史月度流程与原记录；当前周评按实际抽检登记，未抽检颜色不自动产生月度义务。"
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">历史期次</p>
            <h2 className="section-title">原月度实例</h2>
            <p className="muted">点击任意月份可查看该周期的明细、结果和关联评审记录。</p>
          </div>
        </div>
        {workspace.recurringTasks.length === 0 ? (
          <StatePanel
            title="当前项目尚未生成月度评审计划"
            description="当前按实际抽检登记周评，不再自动创建 12 条月度任务。"
          />
        ) : (
          <div className="monthly-review-grid" data-testid="monthly-review-grid">
            {workspace.recurringTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`monthly-review-card monthly-review-card-${getRecurringStatusTone(
                  task.status, task.hasRecordedSampling,
                )}${task.hasRecordedSampling && isCurrentMonth(task.plannedDate) ? ' monthly-review-card-current' : ''}${
                  selectedTaskId === task.id ? ' monthly-review-card-selected' : ''
                }`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <span className="workflow-node-kicker">第 {task.periodIndex} 个月</span>
                <strong>{task.periodLabel}</strong>
                <span>{task.hasRecordedSampling || task.status === 'COMPLETED' ? getRecurringTaskStatusLabel(task.status) : `未登记实际抽检；历史状态：${getRecurringTaskStatusLabel(task.status)}`}</span>
                {task.hasRecordedSampling && isCurrentMonth(task.plannedDate) ? <span className="status-pill status-pill-warning">本月任务</span> : null}
                <span>计划: {formatDate(task.plannedDate)}</span>
                <span>完成: {formatDate(task.completedAt)}</span>
                <RecurringStatusBadge status={task.status} hasRecordedSampling={task.hasRecordedSampling} />
                <span className="table-link">查看详情</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">周期台账</p>
            <h2 className="section-title">周期任务台账</h2>
            <p className="muted">台账字段与周期计划保持一致，便于和流程图、甘特图、日历口径统一。</p>
          </div>
        </div>
        <div className="table-shell table-shell-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>计划日期</th>
                <th>完成日期</th>
                <th>结果</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {workspace.recurringTasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <StatePanel
                      compact
                      title="暂无周期任务"
                      description="没有旧月度记录；请从周评入口登记实际抽检。"
                    />
                  </td>
                </tr>
              ) : (
                workspace.recurringTasks.map((task) => (
                  <tr
                    key={task.id}
                    className={selectedTaskId === task.id ? 'row-selected' : undefined}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <td>{task.periodLabel}</td>
                    <td>{formatDate(task.plannedDate)}</td>
                    <td>{formatDate(task.completedAt)}</td>
                    <td>{getReviewResultLabel(task.result)}</td>
                    <td>
                      <RecurringStatusBadge status={task.status} hasRecordedSampling={task.hasRecordedSampling} />
                    </td>
                    <td>{task.comment ?? '无'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">周期详情</p>
            <h2 className="section-title">周期详情与关联评审</h2>
            <p className="muted">展示选中月份的任务信息，以及该月命中的评审记录。</p>
          </div>
        </div>
        {detailError ? (
          <FeedbackBanner variant="error" title="周期详情加载失败" message={detailError} />
        ) : null}
        {isLoadingDetail ? <p className="muted">正在加载月度评审详情…</p> : null}
        {!isLoadingDetail && detail ? (
          <div className="page-stack compact" data-testid="monthly-review-detail">
            <div className="metadata-grid">
              <div className="metadata-item">
                <span>周期计划</span>
                <strong>{detail.recurringPlan.planCode}</strong>
              </div>
              <div className="metadata-item">
                <span>评审月份</span>
                <strong>{detail.recurringTask.periodLabel}</strong>
              </div>
              <div className="metadata-item">
                <span>任务状态</span>
                <RecurringStatusBadge status={detail.recurringTask.status} hasRecordedSampling={detail.recurringTask.hasRecordedSampling} />
              </div>
              <div className="metadata-item">
                <span>评审结论</span>
                <strong>{getReviewResultLabel(detail.recurringTask.result)}</strong>
              </div>
            </div>
            {selectedTask ? (
              <div className="summary-grid">
                <div className="summary-card">
                  <span>原期次状态</span>
                  <RecurringStatusBadge status={selectedTask.status} hasRecordedSampling={selectedTask.hasRecordedSampling} />
                </div>
                <div className="summary-card">
                  <span>计划日期</span>
                  <strong>{formatDate(selectedTask.plannedDate)}</strong>
                </div>
                <div className="summary-card">
                  <span>完成日期</span>
                  <strong>{formatDate(selectedTask.completedAt)}</strong>
                </div>
                <div className="summary-card">
                  <span>关联评审记录</span>
                  <strong>{String(detail.relatedReviews.length)}</strong>
                </div>
              </div>
            ) : null}
            <div className="detail-block">
              <h3>周期说明</h3>
              <p>{detail.recurringTask.comment ?? '当前月份暂无补充说明。'}</p>
            </div>
            <div className="table-shell table-shell-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>评审人</th>
                    <th>结果</th>
                    <th>评审时间</th>
                    <th>退回节点</th>
                    <th>意见</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.relatedReviews.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <StatePanel
                          compact
                          title="当前月份暂无关联评审记录"
                          description="月度任务已经建档，但该月份暂未查询到匹配的评审记录。"
                        />
                      </td>
                    </tr>
                  ) : (
                    detail.relatedReviews.map((review) => (
                      <tr key={review.id}>
                        <td>{review.reviewerName ?? '未指定'}</td>
                        <td>{getReviewResultLabel(review.result)}</td>
                        <td>{formatDate(review.reviewedAt)}</td>
                        <td>{getWorkflowNodeLabel(review.returnToNodeCode)}</td>
                        <td>{review.comment ?? review.rejectReason ?? '无'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function RecurringStatusBadge({
  status, hasRecordedSampling,
}: {
  status: MonthlyReviewWorkspaceResponse['recurringTasks'][number]['status'];
  hasRecordedSampling?: boolean | undefined;
}) {
  const historical = !hasRecordedSampling && status !== 'COMPLETED';
  return (
    <span
      className={
        historical ? 'status-pill status-pill-neutral' : status === 'COMPLETED'
          ? 'status-pill status-pill-success'
          : status === 'OVERDUE'
            ? 'status-pill status-pill-danger'
            : status === 'IN_PROGRESS'
              ? 'status-pill status-pill-warning'
              : 'status-pill status-pill-neutral'
      }
    >
      {historical ? `未登记实际抽检；历史状态：${getRecurringTaskStatusLabel(status)}` : getRecurringTaskStatusLabel(status)}
    </span>
  );
}

function getRecurringStatusTone(
  status: MonthlyReviewWorkspaceResponse['recurringTasks'][number]['status'],
  hasRecordedSampling?: boolean,
) {
  if (status === 'COMPLETED') {
    return 'completed';
  }
  if (!hasRecordedSampling) return 'pending';

  if (status === 'OVERDUE') {
    return 'overdue';
  }

  if (status === 'IN_PROGRESS') {
    return 'active';
  }

  return 'pending';
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
