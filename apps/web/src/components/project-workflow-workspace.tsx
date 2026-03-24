'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  fetchProject,
  formatDate,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  getWorkflowNodeLabel,
  WORKFLOW_NODE_OPTIONS,
  type ProjectDetail,
  type WorkflowNodeCode,
} from '../lib/projects-client';
import {
  canUserOperateWorkflowTask,
  executeWorkflowAction,
  extractWorkflowTaskByNode,
  fetchProjectWorkflow,
  fetchProjectWorkflowTimeline,
  formatWorkflowTaskTime,
  getVisibleWorkflowActions,
  getWorkflowActionLabel,
  getWorkflowTaskActualTime,
  getWorkflowTaskStatusLabel,
  isWorkflowTaskOverdue,
  sortWorkflowTasks,
  type ProjectWorkflowResponse,
  type ProjectWorkflowTimelineResponse,
  type WorkflowAction,
  type WorkflowTaskSummary,
} from '../lib/workflows-client';

type ProjectWorkflowWorkspaceProps = {
  projectId: string;
  mode: 'workflow' | 'tasks';
};

export function ProjectWorkflowWorkspace({
  projectId,
  mode,
}: ProjectWorkflowWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workflow, setWorkflow] = useState<ProjectWorkflowResponse | null>(null);
  const [timeline, setTimeline] = useState<ProjectWorkflowTimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspaceData({ initial: true });
  }, [projectId]);

  async function loadWorkspaceData(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const [projectDetail, workflowSummary, workflowTimeline] = await Promise.all([
        fetchProject(projectId),
        fetchProjectWorkflow(projectId),
        fetchProjectWorkflowTimeline(projectId),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setProject(projectDetail);
      setWorkflow(workflowSummary);
      setTimeline(workflowTimeline);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '工作流数据加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleAction(task: WorkflowTaskSummary, action: WorkflowAction) {
    setActingKey(`${task.id}:${action}`);
    setError(null);
    setSuccessMessage(null);

    try {
      await executeWorkflowAction(task.id, action);
      await loadWorkspaceData();
      setSuccessMessage(`${task.nodeName} 已执行${getWorkflowActionLabel(action)}。`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '节点动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  if (isLoading || !project || !workflow || !timeline) {
    return (
      <section className="page-card">
        <p className="eyebrow">Workflow Workspace</p>
        <h1>正在加载流程视图…</h1>
        <p>项目状态、任务列表和历史时间线正在刷新。</p>
      </section>
    );
  }

  const orderedTasks =
    mode === 'workflow' ? workflow.activeTasks : sortWorkflowTasks(workflow.taskHistory);
  const currentNodeCode = workflow.workflowInstance.currentNodeCode;

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Workflow Workspace</p>
            <h2 className="section-title">{project.name}</h2>
            <p className="muted">
              当前节点 {getWorkflowNodeLabel(currentNodeCode)}，项目状态 {getProjectStatusLabel(project.status)}，
              风险等级 {getProjectPriorityLabel(project.riskLevel)}。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadWorkspaceData()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/overview`} className="button button-secondary">
              返回概览
            </Link>
          </div>
        </div>
        <div className="metadata-grid">
          <div className="metadata-item">
            <span>当前节点</span>
            <strong>{workflow.workflowInstance.currentNodeName ?? '未开始'}</strong>
          </div>
          <div className="metadata-item">
            <span>实例编号</span>
            <strong>{workflow.workflowInstance.instanceNo}</strong>
          </div>
          <div className="metadata-item">
            <span>目标日期</span>
            <strong>{formatDate(project.targetDate)}</strong>
          </div>
          <div className="metadata-item">
            <span>流程状态</span>
            <strong>{workflow.workflowInstance.status}</strong>
          </div>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Workflow Nodes</p>
            <h2 className="section-title">项目工作流</h2>
            <p className="muted">当前节点高亮显示，历史节点保留最新任务状态和计划时间。</p>
          </div>
        </div>
        <div className="workflow-grid">
          {WORKFLOW_NODE_OPTIONS.map((node) => {
            const task = extractWorkflowTaskByNode(workflow.taskHistory, node.value as WorkflowNodeCode);
            const isCurrent = currentNodeCode === node.value;
            const isDone = task ? ['APPROVED', 'COMPLETED'].includes(task.status) : false;
            const isRejected = task ? ['REJECTED', 'RETURNED'].includes(task.status) : false;
            const isOverdue = task ? isWorkflowTaskOverdue(task) : false;

            return (
              <article
                key={node.value}
                className={`workflow-node-card ${
                  isCurrent
                    ? 'workflow-node-current'
                    : isRejected
                      ? 'workflow-node-rejected'
                      : isDone
                        ? 'workflow-node-done'
                        : 'workflow-node-pending'
                }`}
              >
                <span className="workflow-node-kicker">{node.value}</span>
                <strong>{node.label}</strong>
                <span>{task ? getWorkflowTaskStatusLabel(task.status) : '未触发'}</span>
                <span>负责人: {task?.assigneeUserName ?? '未分配'}</span>
                <span>计划时间: {formatWorkflowTaskTime(task?.dueAt)}</span>
                <span>实际时间: {formatWorkflowTaskTime(getWorkflowTaskActualTime(task ?? emptyTask(node.value as WorkflowNodeCode, node.label)))}</span>
                {isOverdue ? <span className="overdue-badge">超期</span> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">{mode === 'workflow' ? 'Active Tasks' : 'Project Tasks'}</p>
            <h2 className="section-title">
              {mode === 'workflow' ? '当前任务' : '项目任务列表'}
            </h2>
            <p className="muted">动作按钮只走标准接口，并按权限和节点状态控制显示。</p>
          </div>
          {mode === 'workflow' ? (
            <Link href={`/projects/${projectId}/tasks`} className="button button-secondary">
              查看全部任务
            </Link>
          ) : (
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              返回流程视图
            </Link>
          )}
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>节点</th>
                <th>轮次</th>
                <th>状态</th>
                <th>负责人</th>
                <th>计划时间</th>
                <th>实际时间</th>
                <th>超期</th>
                <th>动作</th>
              </tr>
            </thead>
            <tbody>
              {orderedTasks.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <strong>当前没有可展示任务</strong>
                      <p>项目创建后，工作流节点任务会自动出现在这里。</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orderedTasks.map((task) => {
                  const visibleActions = getVisibleWorkflowActions(task.availableActions);
                  const canOperate = canUserOperateWorkflowTask(user, task);
                  const actualTime = getWorkflowTaskActualTime(task);
                  const isOverdue = isWorkflowTaskOverdue(task);

                  return (
                    <tr key={task.id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{task.nodeName}</strong>
                          <span>{task.isPrimary ? '主任务' : '并行任务'}</span>
                        </div>
                      </td>
                      <td>第 {task.taskRound} 轮</td>
                      <td>{getWorkflowTaskStatusLabel(task.status)}</td>
                      <td>{task.assigneeUserName ?? '未分配'}</td>
                      <td>{formatWorkflowTaskTime(task.dueAt)}</td>
                      <td>{formatWorkflowTaskTime(actualTime)}</td>
                      <td>{isOverdue ? <span className="overdue-badge">超期</span> : '否'}</td>
                      <td>
                        <div className="task-actions">
                          {canOperate
                            ? visibleActions.map((action) => {
                                const actionKey = `${task.id}:${action}`;

                                return (
                                  <button
                                    key={actionKey}
                                    type="button"
                                    className="button button-secondary button-small"
                                    disabled={actingKey === actionKey}
                                    onClick={() => void handleAction(task, action)}
                                  >
                                    {actingKey === actionKey
                                      ? '处理中…'
                                      : getWorkflowActionLabel(action)}
                                  </button>
                                );
                              })
                            : null}
                          {(!canOperate || visibleActions.length === 0) ? (
                            <span className="muted">无可执行动作</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {mode === 'workflow' ? (
        <section className="page-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Transition Timeline</p>
              <h2 className="section-title">历史流转时间线</h2>
              <p className="muted">按时间倒序展示节点动作、操作者和流转去向。</p>
            </div>
          </div>
          <div className="timeline-list">
            {[...timeline.timeline].reverse().map((entry) => (
              <article key={entry.id} className="timeline-card">
                <div className="timeline-header">
                  <strong>{entry.toNodeName ?? entry.fromNodeName ?? '工作流动作'}</strong>
                  <span>{formatDate(entry.createdAt)}</span>
                </div>
                <p className="muted">
                  {entry.operatorName ?? '系统'} 执行了 {entry.action.toLowerCase()}
                  {entry.fromNodeName ? `，从 ${entry.fromNodeName}` : ''}
                  {entry.toNodeName ? ` 到 ${entry.toNodeName}` : ''}。
                </p>
                {entry.comment ? <p className="timeline-comment">{entry.comment}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function emptyTask(nodeCode: WorkflowNodeCode, nodeName: string): WorkflowTaskSummary {
  return {
    id: `${nodeCode}-empty`,
    taskNo: `${nodeCode}-empty`,
    nodeCode,
    nodeName,
    taskRound: 0,
    status: 'PENDING',
    isPrimary: true,
    isActive: false,
    assigneeUserId: null,
    assigneeUserName: null,
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}
