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
  fetchWorkflowTaskDetail,
  fetchWorkflowTaskRoundHistory,
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
  type WorkflowTaskDetailResponse,
  type WorkflowTaskRoundHistoryResponse,
  type WorkflowTaskSummary,
} from '../lib/workflows-client';

type ProjectWorkflowWorkspaceProps = {
  projectId: string;
  mode: 'workflow' | 'tasks';
};

const PRIMARY_FLOW_NODES: WorkflowNodeCode[] = [
  'PROJECT_INITIATION',
  'DEVELOPMENT_REPORT',
  'PAINT_DEVELOPMENT',
  'SAMPLE_COLOR_CONFIRMATION',
  'PAINT_PROCUREMENT',
  'FIRST_UNIT_PRODUCTION_PLAN',
  'TRIAL_PRODUCTION',
  'CAB_REVIEW',
  'COLOR_CONSISTENCY_REVIEW',
  'MASS_PRODUCTION_PLAN',
  'MASS_PRODUCTION',
  'VISUAL_COLOR_DIFFERENCE_REVIEW',
  'PROJECT_CLOSED',
];

const PARALLEL_FLOW_GROUPS: Array<{
  title: string;
  description: string;
  nodes: WorkflowNodeCode[];
}> = [
  {
    title: '样板确认并行支线',
    description: '第 4 步完成后并行触发新颜色取号。',
    nodes: ['COLOR_NUMBERING'],
  },
  {
    title: '采购后并行支线',
    description: '第 6 步完成后并行触发标准板、色板明细和性能试验。',
    nodes: ['STANDARD_BOARD_PRODUCTION', 'BOARD_DETAIL_UPDATE', 'PERFORMANCE_TEST'],
  },
  {
    title: '收费并行支线',
    description: '第 12 步通过后并行触发第 13 步固定金额收费。',
    nodes: ['DEVELOPMENT_ACCEPTANCE'],
  },
];

export function ProjectWorkflowWorkspace({
  projectId,
  mode,
}: ProjectWorkflowWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const selectedTaskRequestIdRef = useRef(0);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workflow, setWorkflow] = useState<ProjectWorkflowResponse | null>(null);
  const [timeline, setTimeline] = useState<ProjectWorkflowTimelineResponse | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<WorkflowTaskDetailResponse | null>(null);
  const [selectedTaskRounds, setSelectedTaskRounds] = useState<WorkflowTaskRoundHistoryResponse | null>(null);
  const [isLoadingSelectedTask, setIsLoadingSelectedTask] = useState(false);
  const [selectedTaskError, setSelectedTaskError] = useState<string | null>(null);
  const [selectedTaskVersion, setSelectedTaskVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspaceData({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!workflow) {
      setSelectedTaskId(null);
      return;
    }

    const availableTaskIds = new Set([
      ...workflow.activeTasks.map((task) => task.id),
      ...workflow.taskHistory.map((task) => task.id),
    ]);

    if (selectedTaskId && availableTaskIds.has(selectedTaskId)) {
      return;
    }

    const defaultTaskId = workflow.activeTasks[0]?.id ?? workflow.taskHistory[0]?.id ?? null;
    setSelectedTaskId(defaultTaskId);
  }, [selectedTaskId, workflow]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTaskDetail(null);
      setSelectedTaskRounds(null);
      setSelectedTaskError(null);
      return;
    }

    void loadSelectedTask(selectedTaskId);
  }, [selectedTaskId, selectedTaskVersion]);

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
      setSelectedTaskVersion((current) => current + 1);
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

  async function loadSelectedTask(taskId: string) {
    const requestId = ++selectedTaskRequestIdRef.current;
    setIsLoadingSelectedTask(true);
    setSelectedTaskError(null);

    try {
      const [detail, rounds] = await Promise.all([
        fetchWorkflowTaskDetail(taskId),
        fetchWorkflowTaskRoundHistory(taskId),
      ]);

      if (requestId !== selectedTaskRequestIdRef.current) {
        return;
      }

      setSelectedTaskDetail(detail);
      setSelectedTaskRounds(rounds);
    } catch (loadError) {
      if (requestId !== selectedTaskRequestIdRef.current) {
        return;
      }

      setSelectedTaskError(loadError instanceof Error ? loadError.message : '节点详情加载失败。');
    } finally {
      if (requestId === selectedTaskRequestIdRef.current) {
        setIsLoadingSelectedTask(false);
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
  const latestTaskByNode = Object.fromEntries(
    WORKFLOW_NODE_OPTIONS.map((node) => [
      node.value,
      extractWorkflowTaskByNode(workflow.taskHistory, node.value as WorkflowNodeCode),
    ]),
  ) as Record<WorkflowNodeCode, WorkflowTaskSummary | null>;
  const ganttItems = WORKFLOW_NODE_OPTIONS.map(
    (node) => latestTaskByNode[node.value as WorkflowNodeCode],
  )
    .filter((task): task is WorkflowTaskSummary => task !== null)
    .map((task) => {
      const planStart = task.createdAt;
      const planEnd = task.dueAt ?? task.createdAt;
      const actualStart = task.startedAt ?? task.completedAt ?? task.returnedAt ?? task.createdAt;
      const actualEnd = getWorkflowTaskActualTime(task) ?? actualStart;

      return {
        task,
        planStart,
        planEnd,
        actualStart,
        actualEnd,
      };
    });
  const ganttBounds = getGanttBounds(ganttItems);
  const kanbanColumns = buildKanbanColumns(workflow.taskHistory);
  const calendarMonths = buildWorkflowCalendarMonths(ganttItems);
  const ownerGroups = groupWorkflowTasks(workflow.taskHistory, (task) => task.assigneeUserName ?? '未分配负责人');
  const departmentGroups = groupWorkflowTasks(
    workflow.taskHistory,
    (task) => task.assigneeDepartmentName ?? '未分配部门',
  );

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
            <p className="eyebrow">Workflow Map</p>
            <h2 className="section-title">流程图视图</h2>
            <p className="muted">同一份任务状态同时投影到主线、并行支线和节点卡片，状态颜色保持一致。</p>
          </div>
        </div>
        <div className="page-stack compact">
          <div className="workflow-lane">
            <div className="workflow-lane-copy">
              <strong>主线推进</strong>
              <p>01 → 02 → 03 → 04 → 06 → 10 → 11 → 12 → 14 → 15 → 16 → 17 → 18</p>
            </div>
            <div className="workflow-flow-grid">
              {PRIMARY_FLOW_NODES.map((nodeCode) => {
                const task = latestTaskByNode[nodeCode];
                const nodeLabel = getWorkflowNodeLabel(nodeCode);
                const isCurrent = currentNodeCode === nodeCode;
                const isDone = task ? ['APPROVED', 'COMPLETED'].includes(task.status) : false;
                const isRejected = task ? ['REJECTED', 'RETURNED'].includes(task.status) : false;

                return (
                  <button
                    key={nodeCode}
                    type="button"
                    className={`workflow-node-card workflow-node-button ${
                      isCurrent
                        ? 'workflow-node-current'
                        : isRejected
                          ? 'workflow-node-rejected'
                          : isDone
                            ? 'workflow-node-done'
                            : 'workflow-node-pending'
                    }${selectedTaskId && task?.id === selectedTaskId ? ' workflow-node-selected' : ''}`}
                    disabled={!task}
                    onClick={() => task && setSelectedTaskId(task.id)}
                  >
                    <span className="workflow-node-kicker">{nodeCode}</span>
                    <strong>{nodeLabel}</strong>
                    <span>{task ? getWorkflowTaskStatusLabel(task.status) : '未触发'}</span>
                    <span>负责人: {task?.assigneeUserName ?? '未分配'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {PARALLEL_FLOW_GROUPS.map((group) => (
            <div key={group.title} className="workflow-lane">
              <div className="workflow-lane-copy">
                <strong>{group.title}</strong>
                <p>{group.description}</p>
              </div>
              <div className="workflow-flow-grid workflow-flow-grid-compact">
                {group.nodes.map((nodeCode) => {
                  const task = latestTaskByNode[nodeCode];
                  const isDone = task ? ['APPROVED', 'COMPLETED'].includes(task.status) : false;
                  const isRejected = task ? ['REJECTED', 'RETURNED'].includes(task.status) : false;

                  return (
                    <button
                      key={nodeCode}
                      type="button"
                      className={`workflow-node-card workflow-node-button ${
                        isRejected
                          ? 'workflow-node-rejected'
                          : isDone
                            ? 'workflow-node-done'
                            : 'workflow-node-pending'
                      }${selectedTaskId && task?.id === selectedTaskId ? ' workflow-node-selected' : ''}`}
                      disabled={!task}
                      onClick={() => task && setSelectedTaskId(task.id)}
                    >
                      <span className="workflow-node-kicker">{nodeCode}</span>
                      <strong>{getWorkflowNodeLabel(nodeCode)}</strong>
                      <span>{task ? getWorkflowTaskStatusLabel(task.status) : '未触发'}</span>
                      <span>计划时间: {formatWorkflowTaskTime(task?.dueAt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
                          <button
                            type="button"
                            className={`button button-secondary button-small${
                              selectedTaskId === task.id ? ' button-selected' : ''
                            }`}
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            {selectedTaskId === task.id ? '已选中' : '查看详情'}
                          </button>
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
        <>
          <section className="page-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Gantt</p>
                <h2 className="section-title">甘特图视图</h2>
                <p className="muted">同一节点同时展示计划时间和实际时间，便于追踪滞后与并行支线。</p>
              </div>
            </div>
            <div className="gantt-shell">
              {ganttBounds ? (
                <>
                  <div className="gantt-axis">
                    {ganttBounds.labels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="gantt-body">
                    {ganttItems.map((item) => (
                      <div key={item.task.id} className="gantt-row">
                        <div className="gantt-meta">
                          <strong>{item.task.nodeName}</strong>
                          <span>
                            {item.task.assigneeUserName ?? '未分配'} / {getWorkflowTaskStatusLabel(item.task.status)}
                          </span>
                        </div>
                        <div className="gantt-track">
                          <div
                            className="gantt-bar gantt-bar-plan"
                            style={getGanttBarStyle(item.planStart, item.planEnd, ganttBounds)}
                          />
                          <div
                            className="gantt-bar gantt-bar-actual"
                            style={getGanttBarStyle(item.actualStart, item.actualEnd, ganttBounds)}
                          />
                          {selectedTaskId === item.task.id ? <div className="gantt-selected-outline" /> : null}
                        </div>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => setSelectedTaskId(item.task.id)}
                        >
                          查看
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <strong>暂无可绘制的甘特数据</strong>
                  <p>节点触发后会自动显示计划条和实际条。</p>
                </div>
              )}
            </div>
          </section>

          <section className="page-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Kanban</p>
                <h2 className="section-title">任务状态看板</h2>
                <p className="muted">按状态聚合所有节点任务，便于负责人快速识别待办、进行中和异常项。</p>
              </div>
            </div>
            <div className="kanban-grid">
              {kanbanColumns.map((column) => (
                <div key={column.title} className="kanban-column">
                  <div className="kanban-column-header">
                    <strong>{column.title}</strong>
                    <span>{column.tasks.length} 项</span>
                  </div>
                  <div className="kanban-list">
                    {column.tasks.length === 0 ? (
                      <div className="empty-state">
                        <strong>当前分组为空</strong>
                        <p>流程推进后，这里会自动同步对应任务。</p>
                      </div>
                    ) : (
                      column.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={`kanban-card${selectedTaskId === task.id ? ' kanban-card-selected' : ''}`}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <strong>{task.nodeName}</strong>
                          <span>第 {task.taskRound} 轮</span>
                          <span>负责人: {task.assigneeUserName ?? '未分配'}</span>
                          <span>计划: {formatWorkflowTaskTime(task.dueAt)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="page-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Deadline Calendar</p>
                <h2 className="section-title">截止日历</h2>
                <p className="muted">按月展示节点计划日期，超期节点与已选节点在日历中同步高亮。</p>
              </div>
            </div>
            <div className="calendar-grid">
              {calendarMonths.length === 0 ? (
                <div className="empty-state">
                  <strong>暂无截止日历数据</strong>
                  <p>节点生成计划时间后，这里会自动按月排布。</p>
                </div>
              ) : (
                calendarMonths.map((month) => (
                  <div key={month.key} className="calendar-card">
                    <div className="calendar-card-header">
                      <strong>{month.label}</strong>
                      <span>{month.eventCount} 个截止项</span>
                    </div>
                    <div className="calendar-weekdays">
                      {['日', '一', '二', '三', '四', '五', '六'].map((weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ))}
                    </div>
                    <div className="calendar-days">
                      {month.cells.map((cell, index) => (
                        <div
                          key={`${month.key}-${index}`}
                          className={`calendar-day${cell.isCurrentMonth ? '' : ' calendar-day-muted'}`}
                        >
                          <span className="calendar-day-number">{cell.dayLabel}</span>
                          <div className="calendar-day-events">
                            {cell.events.map((event) => (
                              <button
                                key={event.task.id}
                                type="button"
                                className={`calendar-event${
                                  selectedTaskId === event.task.id ? ' calendar-event-selected' : ''
                                }${event.isOverdue ? ' calendar-event-overdue' : ''}`}
                                onClick={() => setSelectedTaskId(event.task.id)}
                              >
                                {event.task.nodeName}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="page-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Owner / Department</p>
              <h2 className="section-title">负责人视图与部门视图</h2>
              <p className="muted">项目任务列表按负责人和部门二次聚合，便于责任分配和部门协同验收。</p>
            </div>
          </div>
          <div className="double-panel-grid">
            <div className="detail-block">
              <h3>负责人视图</h3>
              <div className="grouped-task-list">
                {ownerGroups.map((group) => (
                  <div key={group.key} className="grouped-task-card">
                    <div className="timeline-header">
                      <strong>{group.key}</strong>
                      <span>{group.tasks.length} 项</span>
                    </div>
                    <p className="muted">
                      活跃 {group.activeCount} / 超期 {group.overdueCount}
                    </p>
                    <div className="tag-row">
                      {group.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={`grouped-task-chip${
                            selectedTaskId === task.id ? ' grouped-task-chip-selected' : ''
                          }`}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.nodeName}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="detail-block">
              <h3>部门视图</h3>
              <div className="grouped-task-list">
                {departmentGroups.map((group) => (
                  <div key={group.key} className="grouped-task-card">
                    <div className="timeline-header">
                      <strong>{group.key}</strong>
                      <span>{group.tasks.length} 项</span>
                    </div>
                    <p className="muted">
                      活跃 {group.activeCount} / 超期 {group.overdueCount}
                    </p>
                    <div className="tag-row">
                      {group.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={`grouped-task-chip${
                            selectedTaskId === task.id ? ' grouped-task-chip-selected' : ''
                          }`}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.nodeName}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Task Detail</p>
            <h2 className="section-title">节点详情与轮次历史</h2>
            <p className="muted">展示当前选中节点的详情、流转记录和历史轮次，便于跟踪第 12 步退回后的新轮次。</p>
          </div>
        </div>
        {selectedTaskError ? <p className="error-text">{selectedTaskError}</p> : null}
        {isLoadingSelectedTask ? <p className="muted">正在加载节点详情…</p> : null}
        {!isLoadingSelectedTask && selectedTaskDetail && selectedTaskRounds ? (
          <div className="page-stack">
            <div className="metadata-grid">
              <div className="metadata-item">
                <span>节点</span>
                <strong>{selectedTaskDetail.task.nodeName}</strong>
              </div>
              <div className="metadata-item">
                <span>当前状态</span>
                <strong>{getWorkflowTaskStatusLabel(selectedTaskDetail.task.status)}</strong>
              </div>
              <div className="metadata-item">
                <span>负责人</span>
                <strong>{selectedTaskDetail.task.assigneeUserName ?? '未分配'}</strong>
              </div>
              <div className="metadata-item">
                <span>当前轮次</span>
                <strong>第 {selectedTaskDetail.task.taskRound} 轮</strong>
              </div>
              <div className="metadata-item">
                <span>计划完成</span>
                <strong>{formatWorkflowTaskTime(selectedTaskDetail.task.dueAt)}</strong>
              </div>
              <div className="metadata-item">
                <span>可执行动作</span>
                <strong>
                  {selectedTaskDetail.task.availableActions.length > 0
                    ? selectedTaskDetail.task.availableActions
                        .map((action) => getWorkflowActionLabel(action))
                        .join(' / ')
                    : '无'}
                </strong>
              </div>
            </div>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>轮次</th>
                    <th>状态</th>
                    <th>负责人</th>
                    <th>计划时间</th>
                    <th>实际时间</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTaskRounds.rounds.map((round) => (
                    <tr key={round.id}>
                      <td>第 {round.taskRound} 轮</td>
                      <td>{getWorkflowTaskStatusLabel(round.status)}</td>
                      <td>{round.assigneeUserName ?? '未分配'}</td>
                      <td>{formatWorkflowTaskTime(round.dueAt)}</td>
                      <td>{formatWorkflowTaskTime(getWorkflowTaskActualTime(round))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="timeline-list">
              {selectedTaskDetail.transitions.length === 0 ? (
                <p className="muted">当前节点还没有流转记录。</p>
              ) : (
                selectedTaskDetail.transitions.map((entry) => (
                  <article key={entry.id} className="timeline-card">
                    <div className="timeline-header">
                      <strong>{entry.toNodeName ?? entry.fromNodeName ?? selectedTaskDetail.task.nodeName}</strong>
                      <span>{formatDate(entry.createdAt)}</span>
                    </div>
                    <p className="muted">
                      {entry.operatorName ?? '系统'} 执行了 {entry.action.toLowerCase()}
                      {entry.fromNodeName ? `，从 ${entry.fromNodeName}` : ''}
                      {entry.toNodeName ? ` 到 ${entry.toNodeName}` : ''}。
                    </p>
                    {entry.comment ? <p className="timeline-comment">{entry.comment}</p> : null}
                  </article>
                ))
              )}
            </div>
          </div>
        ) : null}
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

type GanttItem = {
  task: WorkflowTaskSummary;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
};

type GanttBounds = {
  startAt: number;
  endAt: number;
  labels: string[];
};

function getGanttBounds(items: GanttItem[]): GanttBounds | null {
  if (items.length === 0) {
    return null;
  }

  const timestamps = items.flatMap((item) => [
    new Date(item.planStart).getTime(),
    new Date(item.planEnd).getTime(),
    new Date(item.actualStart).getTime(),
    new Date(item.actualEnd).getTime(),
  ]);
  const startAt = Math.min(...timestamps);
  const endAt = Math.max(...timestamps);
  const totalDays = Math.max(1, Math.ceil((endAt - startAt) / 86_400_000));
  const segmentCount = Math.min(6, Math.max(3, totalDays));

  return {
    startAt,
    endAt,
    labels: Array.from({ length: segmentCount + 1 }, (_, index) => {
      const ratio = index / segmentCount;
      const value = new Date(startAt + (endAt - startAt) * ratio);
      return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
    }),
  };
}

function getGanttBarStyle(
  startValue: string,
  endValue: string,
  bounds: GanttBounds,
) {
  const startAt = new Date(startValue).getTime();
  const endAt = new Date(endValue).getTime();
  const total = Math.max(1, bounds.endAt - bounds.startAt);
  const left = ((startAt - bounds.startAt) / total) * 100;
  const width = Math.max(3, ((Math.max(endAt, startAt) - startAt) / total) * 100);

  return {
    left: `${Math.max(0, left)}%`,
    width: `${Math.min(100 - left, width)}%`,
  };
}

function buildKanbanColumns(tasks: WorkflowTaskSummary[]) {
  return [
    {
      title: '待处理',
      tasks: sortWorkflowTasks(
        tasks.filter((task) => task.status === 'PENDING' || task.status === 'READY'),
      ),
    },
    {
      title: '进行中',
      tasks: sortWorkflowTasks(tasks.filter((task) => task.status === 'IN_PROGRESS')),
    },
    {
      title: '已完成 / 已通过',
      tasks: sortWorkflowTasks(
        tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'APPROVED'),
      ),
    },
    {
      title: '退回 / 驳回',
      tasks: sortWorkflowTasks(
        tasks.filter(
          (task) =>
            task.status === 'RETURNED' ||
            task.status === 'REJECTED' ||
            task.status === 'CANCELLED',
        ),
      ),
    },
  ];
}

function buildWorkflowCalendarMonths(items: GanttItem[]) {
  const dueEvents = items
    .filter((item) => item.task.dueAt)
    .map((item) => ({
      task: item.task,
      dueAt: new Date(item.task.dueAt!),
      isOverdue: isWorkflowTaskOverdue(item.task),
    }))
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());

  if (dueEvents.length === 0) {
    return [];
  }

  const monthKeys = Array.from(
    new Set(
      dueEvents.map(
        (event) => `${event.dueAt.getUTCFullYear()}-${String(event.dueAt.getUTCMonth() + 1).padStart(2, '0')}`,
      ),
    ),
  ).slice(0, 3);

  return monthKeys.map((monthKey) => {
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
    const firstWeekday = monthStart.getUTCDay();
    const totalDays = monthEnd.getUTCDate();
    const cells: Array<{
      dayLabel: string;
      isCurrentMonth: boolean;
      events: typeof dueEvents;
    }> = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push({
        dayLabel: '',
        isCurrentMonth: false,
        events: [],
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const events = dueEvents.filter(
        (event) =>
          event.dueAt.getUTCFullYear() === year &&
          event.dueAt.getUTCMonth() === monthIndex &&
          event.dueAt.getUTCDate() === day,
      );

      cells.push({
        dayLabel: String(day),
        isCurrentMonth: true,
        events,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        dayLabel: '',
        isCurrentMonth: false,
        events: [],
      });
    }

    return {
      key: monthKey,
      label: `${year} 年 ${monthIndex + 1} 月`,
      eventCount: dueEvents.filter(
        (event) =>
          event.dueAt.getUTCFullYear() === year && event.dueAt.getUTCMonth() === monthIndex,
      ).length,
      cells,
    };
  });
}

function groupWorkflowTasks(
  tasks: WorkflowTaskSummary[],
  getKey: (task: WorkflowTaskSummary) => string,
) {
  const groups = new Map<
    string,
    {
      key: string;
      tasks: WorkflowTaskSummary[];
      activeCount: number;
      overdueCount: number;
    }
  >();

  for (const task of sortWorkflowTasks(tasks)) {
    const key = getKey(task);
    const existing =
      groups.get(key) ??
      {
        key,
        tasks: [],
        activeCount: 0,
        overdueCount: 0,
      };

    existing.tasks.push(task);
    if (task.isActive) {
      existing.activeCount += 1;
    }
    if (isWorkflowTaskOverdue(task)) {
      existing.overdueCount += 1;
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values()).sort((left, right) => right.tasks.length - left.tasks.length);
}
