'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  canManageSchedulePlans,
  canShowCompleteSchedulePlanTaskButton,
  cancelSchedulePlan,
  completeSchedulePlanTask,
  confirmSchedulePlan,
  createSchedulePlan,
  fetchSchedulePlanPageOptions,
  fetchSchedulePlansWorkspace,
  getDefaultSchedulePlanOwnerId,
  getSchedulePlansWorkspaceHighlights,
  getSchedulePlanStatusLabel,
  toSchedulePlanFormInput,
  updateSchedulePlan,
  validateSchedulePlanForm,
  type SchedulePlanFormInput,
  type SchedulePlanRecord,
  type SchedulePlanStatus,
  type SchedulePlansWorkspaceResponse,
} from '../lib/production-plans-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';
import { getWorkflowTaskStatusLabel, isWorkflowTaskOverdue } from '../lib/workflows-client';

type SchedulePlansWorkspaceProps = {
  projectId: string;
};

const EMPTY_SCHEDULE_PLAN_FORM: SchedulePlanFormInput = {
  planDate: '',
  plannedQuantity: '',
  workshop: '',
  lineName: '',
  ownerId: '',
  batchNo: '',
  note: '',
};

export function SchedulePlansWorkspace({
  projectId,
}: SchedulePlansWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<SchedulePlansWorkspaceResponse | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<DirectoryUser[]>([]);
  const [form, setForm] = useState<SchedulePlanFormInput>(EMPTY_SCHEDULE_PLAN_FORM);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  const canManage = canManageSchedulePlans(user);
  const isReadOnly = !workspace?.activeTask;
  const highlights = workspace ? getSchedulePlansWorkspaceHighlights(workspace) : null;

  const summaryCards = useMemo(
    () => [
      {
        label: '一致性评审',
        value: workspace?.consistencyReviewApproved ? '已通过' : '未通过',
      },
      {
        label: '排产任务状态',
        value: highlights?.activeTaskStatusLabel ?? '当前无排产任务',
      },
      {
        label: '批量生产节点',
        value: highlights?.downstreamTaskStatusLabel ?? '未激活',
      },
      {
        label: '排产记录数',
        value: String(workspace?.items.length ?? 0),
      },
    ],
    [highlights, workspace],
  );

  async function loadWorkspace(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const [nextWorkspace, nextOwners] = await Promise.all([
        fetchSchedulePlansWorkspace(projectId),
        fetchSchedulePlanPageOptions(),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(nextWorkspace);
      setOwnerOptions(nextOwners);
      setForm((current) => ({
        ...current,
        ownerId:
          current.ownerId && nextOwners.some((item) => item.id === current.ownerId)
            ? current.ownerId
            : getDefaultSchedulePlanOwnerId(nextOwners, user?.id ?? null),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '排产计划工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSavePlan() {
    const validationMessage = validateSchedulePlanForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingPlanId
        ? await updateSchedulePlan(projectId, editingPlanId, form)
        : await createSchedulePlan(projectId, form);

      setWorkspace(nextWorkspace);
      resetForm();
      setSuccessMessage(editingPlanId ? '排产计划已更新。' : '排产计划已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '排产计划保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePlanAction(
    action: 'CONFIRM' | 'CANCEL' | 'COMPLETE_TASK',
    plan?: SchedulePlanRecord,
  ) {
    const key =
      action === 'CONFIRM' && plan
        ? `confirm:${plan.id}`
        : action === 'CANCEL' && plan
          ? `cancel:${plan.id}`
          : 'COMPLETE_TASK';

    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'CONFIRM' && plan
          ? await confirmSchedulePlan(projectId, plan.id)
          : action === 'CANCEL' && plan
            ? await cancelSchedulePlan(projectId, plan.id)
            : await completeSchedulePlanTask(projectId);

      setWorkspace(nextWorkspace);
      setSuccessMessage(
        action === 'CONFIRM'
          ? '排产计划已确认。'
          : action === 'CANCEL'
            ? '排产计划已取消。'
            : '排产节点已完成，批量生产已可进入。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '排产动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function resetForm() {
    setEditingPlanId(null);
    setForm({
      ...EMPTY_SCHEDULE_PLAN_FORM,
      ownerId: getDefaultSchedulePlanOwnerId(ownerOptions, user?.id ?? null),
    });
  }

  function prepareEdit(plan: SchedulePlanRecord) {
    setEditingPlanId(plan.id);
    setForm(toSchedulePlanFormInput(plan));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Schedule Plan</p>
        <h1>正在加载排产计划模块…</h1>
        <p>排产记录、任务状态和后续批量生产节点正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Schedule Plan</p>
            <h2 className="section-title">{workspace.project.name}</h2>
            <p className="muted">
              当前节点 {highlights.currentNodeLabel}，目标日期 {highlights.targetDateLabel}，
              风险等级 {highlights.riskLevelLabel}。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadWorkspace()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              查看流程
            </Link>
          </div>
        </div>
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
            <span>当前负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>完成条件</span>
            <strong>{workspace.canCompleteTask ? '已满足' : '未满足'}</strong>
          </div>
          <div className="metadata-item">
            <span>最近计划日期</span>
            <strong>{formatDate(workspace.items[0]?.planDate ?? null)}</strong>
          </div>
          <div className="metadata-item">
            <span>后续节点</span>
            <strong>
              {workspace.downstreamMassProductionTask
                ? getWorkflowTaskStatusLabel(workspace.downstreamMassProductionTask.status)
                : '未激活'}
            </strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前排产计划任务已超期。</p>
        ) : null}
        {!workspace.consistencyReviewApproved ? (
          <p className="muted">颜色一致性评审通过后，才会激活排产计划任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Schedule Form</p>
            <h2 className="section-title">排产计划表单</h2>
            <p className="muted">至少确认一条有效排产计划后，才允许完成排产节点。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <SchedulePlanForm
          value={form}
          ownerOptions={ownerOptions}
          disabled={!canManage || isReadOnly || isSaving}
          submitLabel={editingPlanId ? '更新排产计划' : '新建排产计划'}
          onChange={setForm}
          onSubmit={() => void handleSavePlan()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Node Completion</p>
            <h2 className="section-title">排产节点完成</h2>
            <p className="muted">至少存在一条已确认排产计划后，才能完成排产节点。</p>
          </div>
        </div>
        {workspace.completionIssue ? <p className="muted">{workspace.completionIssue}</p> : null}
        <CompleteScheduleTaskButton
          disabled={
            actingKey === 'COMPLETE_TASK' ||
            !canShowCompleteSchedulePlanTaskButton(user, workspace)
          }
          onClick={() => void handlePlanAction('COMPLETE_TASK')}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Schedule Records</p>
            <h2 className="section-title">排产计划列表</h2>
            <p className="muted">按时间倒序展示，支持草稿编辑、确认和取消。</p>
          </div>
        </div>
        <SchedulePlanTable
          items={workspace.items}
          canManage={canManage}
          isReadOnly={isReadOnly}
          actingKey={actingKey}
          onEdit={prepareEdit}
          onConfirm={(item) => void handlePlanAction('CONFIRM', item)}
          onCancel={(item) => void handlePlanAction('CANCEL', item)}
        />
      </section>
    </div>
  );
}

export function SchedulePlanForm({
  value,
  ownerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: SchedulePlanFormInput;
  ownerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: SchedulePlanFormInput) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>计划日期</span>
        <input
          required
          type="date"
          disabled={disabled}
          value={value.planDate}
          onChange={(event) => onChange({ ...value, planDate: event.target.value })}
        />
      </label>
      <label className="field">
        <span>计划数量</span>
        <input
          required
          disabled={disabled}
          value={value.plannedQuantity}
          onChange={(event) => onChange({ ...value, plannedQuantity: event.target.value })}
        />
      </label>
      <label className="field">
        <span>车间</span>
        <input
          required
          disabled={disabled}
          value={value.workshop}
          onChange={(event) => onChange({ ...value, workshop: event.target.value })}
        />
      </label>
      <label className="field">
        <span>生产线</span>
        <input
          required
          disabled={disabled}
          value={value.lineName}
          onChange={(event) => onChange({ ...value, lineName: event.target.value })}
        />
      </label>
      <label className="field">
        <span>责任人</span>
        <select
          required
          disabled={disabled}
          value={value.ownerId}
          onChange={(event) => onChange({ ...value, ownerId: event.target.value })}
        >
          <option value="">请选择责任人</option>
          {ownerOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>批次号</span>
        <input
          required
          disabled={disabled}
          value={value.batchNo}
          onChange={(event) => onChange({ ...value, batchNo: event.target.value })}
        />
      </label>
      <label className="field field-full">
        <span>备注</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </label>
      <div className="field field-actions">
        <button type="submit" className="button" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function SchedulePlanTable({
  items,
  canManage,
  isReadOnly,
  actingKey,
  onEdit,
  onConfirm,
  onCancel,
}: {
  items: SchedulePlanRecord[];
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onEdit: (item: SchedulePlanRecord) => void;
  onConfirm: (item: SchedulePlanRecord) => void;
  onCancel: (item: SchedulePlanRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>计划单号</th>
            <th>计划日期</th>
            <th>数量</th>
            <th>车间/产线</th>
            <th>责任人</th>
            <th>批次号</th>
            <th>状态</th>
            <th>备注</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="empty-state">
                  <strong>暂无排产计划</strong>
                  <p>一致性评审通过并激活排产任务后，可在这里创建排产计划。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.planNo}</td>
                <td>{formatDate(item.planDate)}</td>
                <td>{item.plannedQuantity ?? '未填写'}</td>
                <td>
                  {[item.workshop, item.lineName].filter(Boolean).join(' / ') || '未填写'}
                </td>
                <td>{item.ownerName ?? '未填写'}</td>
                <td>{item.batchNo ?? '未填写'}</td>
                <td>
                  <ScheduleStatusBadge status={item.status} />
                </td>
                <td>{item.note ?? '无'}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        {item.status === 'DRAFT' ? (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => onEdit(item)}
                          >
                            编辑
                          </button>
                        ) : null}
                        {item.status === 'DRAFT' ? (
                          <button
                            type="button"
                            className="button button-small"
                            disabled={actingKey === `confirm:${item.id}`}
                            onClick={() => onConfirm(item)}
                          >
                            {actingKey === `confirm:${item.id}` ? '处理中…' : '确认'}
                          </button>
                        ) : null}
                        {(item.status === 'DRAFT' || item.status === 'CONFIRMED') ? (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            disabled={actingKey === `cancel:${item.id}`}
                            onClick={() => onCancel(item)}
                          >
                            {actingKey === `cancel:${item.id}` ? '处理中…' : '取消'}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">只读</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleStatusBadge({
  status,
}: {
  status: SchedulePlanStatus;
}) {
  const className =
    status === 'CONFIRMED'
      ? 'status-pill status-pill-success'
      : status === 'CANCELLED'
        ? 'status-pill status-pill-danger'
        : 'status-pill status-pill-warning';

  return <span className={className}>{getSchedulePlanStatusLabel(status)}</span>;
}

export function CompleteScheduleTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成排产节点
    </button>
  );
}
