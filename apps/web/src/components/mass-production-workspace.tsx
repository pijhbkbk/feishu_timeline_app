'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  canManageMassProductions,
  canShowCompleteMassProductionTaskButton,
  cancelMassProductionRecord,
  completeMassProductionRecord,
  completeMassProductionTask,
  createMassProductionRecord,
  fetchMassProductionPageOptions,
  fetchMassProductionWorkspace,
  getDefaultMassProductionOwnerId,
  getMassProductionStatusLabel,
  getMassProductionWorkspaceHighlights,
  startMassProductionRecord,
  toMassProductionFormInput,
  updateMassProductionRecord,
  validateMassProductionForm,
  type MassProductionFormInput,
  type MassProductionRecord,
  type MassProductionStatus,
  type MassProductionWorkspaceResponse,
} from '../lib/mass-production-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';
import { isWorkflowTaskOverdue } from '../lib/workflows-client';

type MassProductionWorkspaceProps = {
  projectId: string;
};

const EMPTY_MASS_PRODUCTION_FORM: MassProductionFormInput = {
  productionDate: '',
  batchNo: '',
  plannedQuantity: '',
  actualQuantity: '',
  workshop: '',
  lineName: '',
  ownerId: '',
  exceptionNote: '',
  status: 'DRAFT',
};

export function MassProductionWorkspace({
  projectId,
}: MassProductionWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<MassProductionWorkspaceResponse | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<DirectoryUser[]>([]);
  const [form, setForm] = useState<MassProductionFormInput>(EMPTY_MASS_PRODUCTION_FORM);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  const canManage = canManageMassProductions(user);
  const isReadOnly = !workspace?.activeTask;
  const highlights = workspace ? getMassProductionWorkspaceHighlights(workspace) : null;

  const summaryCards = useMemo(
    () => [
      {
        label: '排产计划',
        value: workspace?.schedulePlanCompleted ? '已完成' : '未完成',
      },
      {
        label: '批量生产任务',
        value: highlights?.activeTaskStatusLabel ?? '当前无批量生产任务',
      },
      {
        label: '目视色差评审',
        value: highlights?.downstreamTaskStatusLabel ?? '未激活',
      },
      {
        label: '生产记录数',
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
        fetchMassProductionWorkspace(projectId),
        fetchMassProductionPageOptions(),
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
            : getDefaultMassProductionOwnerId(nextOwners, user?.id ?? null),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '批量生产工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveRecord() {
    const validationMessage = validateMassProductionForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingRecordId
        ? await updateMassProductionRecord(projectId, editingRecordId, form)
        : await createMassProductionRecord(projectId, form);

      setWorkspace(nextWorkspace);
      resetForm();
      setSuccessMessage(editingRecordId ? '批量生产记录已更新。' : '批量生产记录已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '批量生产记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRecordAction(
    action: 'START' | 'COMPLETE' | 'CANCEL' | 'COMPLETE_TASK',
    record?: MassProductionRecord,
  ) {
    const key =
      action === 'START' && record
        ? `start:${record.id}`
        : action === 'COMPLETE' && record
          ? `complete:${record.id}`
          : action === 'CANCEL' && record
            ? `cancel:${record.id}`
            : 'COMPLETE_TASK';

    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'START' && record
          ? await startMassProductionRecord(projectId, record.id)
          : action === 'COMPLETE' && record
            ? await completeMassProductionRecord(projectId, record.id)
            : action === 'CANCEL' && record
              ? await cancelMassProductionRecord(projectId, record.id)
              : await completeMassProductionTask(projectId);

      setWorkspace(nextWorkspace);
      setSuccessMessage(
        action === 'START'
          ? '批量生产已开始。'
          : action === 'COMPLETE'
            ? '批量生产记录已完成。'
            : action === 'CANCEL'
              ? '批量生产记录已取消。'
              : '批量生产节点已完成，目视色差评审已可进入。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '批量生产动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function resetForm() {
    setEditingRecordId(null);
    setForm({
      ...EMPTY_MASS_PRODUCTION_FORM,
      ownerId: getDefaultMassProductionOwnerId(ownerOptions, user?.id ?? null),
    });
  }

  function prepareEdit(record: MassProductionRecord) {
    setEditingRecordId(record.id);
    setForm(toMassProductionFormInput(record));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Mass Production</p>
        <h1>正在加载批量生产模块…</h1>
        <p>生产记录、节点状态和后续目视色差评审正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Mass Production</p>
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
            <span>最近生产日期</span>
            <strong>{formatDate(workspace.items[0]?.productionDate ?? null)}</strong>
          </div>
          <div className="metadata-item">
            <span>最近记录状态</span>
            <strong>
              {workspace.items[0]
                ? getMassProductionStatusLabel(workspace.items[0].status)
                : '暂无'}
            </strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前批量生产任务已超期。</p>
        ) : null}
        {!workspace.schedulePlanCompleted ? (
          <p className="muted">排产计划完成后，才会激活批量生产任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Mass Production Form</p>
            <h2 className="section-title">批量生产记录表单</h2>
            <p className="muted">先创建记录，再按业务进度开始和完成批量生产。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <MassProductionForm
          value={form}
          ownerOptions={ownerOptions}
          disabled={!canManage || isReadOnly || isSaving}
          submitLabel={editingRecordId ? '更新生产记录' : '新建生产记录'}
          onChange={setForm}
          onSubmit={() => void handleSaveRecord()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Node Completion</p>
            <h2 className="section-title">批量生产节点完成</h2>
            <p className="muted">至少存在一条已完成的生产记录后，才允许完成节点。</p>
          </div>
        </div>
        {workspace.completionIssue ? <p className="muted">{workspace.completionIssue}</p> : null}
        <CompleteMassProductionTaskButton
          disabled={
            actingKey === 'COMPLETE_TASK' ||
            !canShowCompleteMassProductionTaskButton(user, workspace)
          }
          onClick={() => void handleRecordAction('COMPLETE_TASK')}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Mass Production Records</p>
            <h2 className="section-title">批量生产记录列表</h2>
            <p className="muted">支持开始、完成、取消和异常说明查看。</p>
          </div>
        </div>
        <MassProductionTable
          items={workspace.items}
          canManage={canManage}
          isReadOnly={isReadOnly}
          actingKey={actingKey}
          onEdit={prepareEdit}
          onStart={(record) => void handleRecordAction('START', record)}
          onComplete={(record) => void handleRecordAction('COMPLETE', record)}
          onCancel={(record) => void handleRecordAction('CANCEL', record)}
        />
      </section>
    </div>
  );
}

export function MassProductionForm({
  value,
  ownerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: MassProductionFormInput;
  ownerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: MassProductionFormInput) => void;
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
        <span>生产日期</span>
        <input
          required
          type="date"
          disabled={disabled}
          value={value.productionDate}
          onChange={(event) => onChange({ ...value, productionDate: event.target.value })}
        />
      </label>
      <label className="field">
        <span>生产批次</span>
        <input
          required
          disabled={disabled}
          value={value.batchNo}
          onChange={(event) => onChange({ ...value, batchNo: event.target.value })}
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
        <span>实际数量</span>
        <input
          disabled={disabled}
          value={value.actualQuantity}
          onChange={(event) => onChange({ ...value, actualQuantity: event.target.value })}
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
        <span>状态</span>
        <select disabled value={value.status} onChange={() => undefined}>
          <option value="DRAFT">草稿</option>
          <option value="IN_PROGRESS">进行中</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
        </select>
      </label>
      <label className="field field-full">
        <span>异常说明</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.exceptionNote}
          onChange={(event) => onChange({ ...value, exceptionNote: event.target.value })}
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

export function MassProductionTable({
  items,
  canManage,
  isReadOnly,
  actingKey,
  onEdit,
  onStart,
  onComplete,
  onCancel,
}: {
  items: MassProductionRecord[];
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onEdit: (item: MassProductionRecord) => void;
  onStart: (item: MassProductionRecord) => void;
  onComplete: (item: MassProductionRecord) => void;
  onCancel: (item: MassProductionRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>记录编号</th>
            <th>生产日期</th>
            <th>批次</th>
            <th>数量</th>
            <th>车间/产线</th>
            <th>责任人</th>
            <th>状态</th>
            <th>异常说明</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="empty-state">
                  <strong>暂无批量生产记录</strong>
                  <p>排产节点完成并激活批量生产任务后，可在这里创建记录。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.planNo}</td>
                <td>{formatDate(item.productionDate)}</td>
                <td>{item.batchNo ?? '未填写'}</td>
                <td>
                  {item.plannedQuantity ?? '未填写'} / {item.actualQuantity ?? '未填写'}
                </td>
                <td>
                  {[item.workshop, item.lineName].filter(Boolean).join(' / ') || '未填写'}
                </td>
                <td>{item.ownerName ?? '未填写'}</td>
                <td>
                  <ProductionStatusBadge status={item.status} />
                </td>
                <td>{item.exceptionNote ?? '无'}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        {(item.status === 'DRAFT' || item.status === 'IN_PROGRESS') ? (
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
                            disabled={actingKey === `start:${item.id}`}
                            onClick={() => onStart(item)}
                          >
                            {actingKey === `start:${item.id}` ? '处理中…' : '开始'}
                          </button>
                        ) : null}
                        {item.status === 'IN_PROGRESS' ? (
                          <button
                            type="button"
                            className="button button-small"
                            disabled={actingKey === `complete:${item.id}`}
                            onClick={() => onComplete(item)}
                          >
                            {actingKey === `complete:${item.id}` ? '处理中…' : '完成'}
                          </button>
                        ) : null}
                        {(item.status === 'DRAFT' || item.status === 'IN_PROGRESS') ? (
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

export function ProductionStatusBadge({
  status,
}: {
  status: MassProductionStatus;
}) {
  const className =
    status === 'COMPLETED'
      ? 'status-pill status-pill-success'
      : status === 'IN_PROGRESS'
        ? 'status-pill status-pill-warning'
        : status === 'CANCELLED'
          ? 'status-pill status-pill-danger'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getMassProductionStatusLabel(status)}</span>;
}

export function CompleteMassProductionTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成批量生产节点
    </button>
  );
}
