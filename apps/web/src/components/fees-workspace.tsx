'use client';

import Link from 'next/link';
import React, { useMemo, useRef, useState, useEffect } from 'react';

import { useAuth } from './auth-provider';
import {
  canManageFees,
  canShowCompleteFeeTaskButton,
  cancelFee,
  completeFeeTask,
  createFee,
  fetchFeesWorkspace,
  FIXED_DEVELOPMENT_FEE_AMOUNT,
  FIXED_DEVELOPMENT_FEE_TYPE,
  getFeeStatusLabel,
  getFeesWorkspaceHighlights,
  getFeeTypeLabel,
  markPaidFee,
  markRecordedFee,
  toFeeFormInput,
  updateFee,
  validateFeeForm,
  type FeeFormInput,
  type FeeRecord,
  type FeesWorkspaceResponse,
} from '../lib/fees-client';
import { formatDate } from '../lib/projects-client';
import { isWorkflowTaskOverdue } from '../lib/workflows-client';

type FeesWorkspaceProps = {
  projectId: string;
};

const EMPTY_FEE_FORM: FeeFormInput = {
  feeType: FIXED_DEVELOPMENT_FEE_TYPE,
  amount: FIXED_DEVELOPMENT_FEE_AMOUNT,
  currency: 'CNY',
  payer: '',
  payStatus: 'PENDING',
  recordedAt: '',
  note: '',
};

export function FeesWorkspace({ projectId }: FeesWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<FeesWorkspaceResponse | null>(null);
  const [form, setForm] = useState<FeeFormInput>(EMPTY_FEE_FORM);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  const canManage = canManageFees(user);
  const isReadOnly = !workspace?.activeTask;
  const highlights = workspace ? getFeesWorkspaceHighlights(workspace) : null;

  const summaryCards = useMemo(
    () => [
      {
        label: '收费任务状态',
        value: highlights?.activeTaskStatusLabel ?? '当前无收费任务',
      },
      {
        label: '驾驶室评审',
        value: workspace?.cabinReviewApproved ? '已通过' : '未通过',
      },
      {
        label: '已支付记录',
        value: String(workspace?.statistics.paidCount ?? 0),
      },
      {
        label: '历史记录数',
        value: String(workspace?.statistics.totalCount ?? 0),
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
      const response = await fetchFeesWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '开发收费工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveFee() {
    const validationMessage = validateFeeForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingFeeId
        ? await updateFee(projectId, editingFeeId, form)
        : await createFee(projectId, form);
      setWorkspace(nextWorkspace);
      setEditingFeeId(null);
      setForm(EMPTY_FEE_FORM);
      setSuccessMessage(editingFeeId ? '收费记录已更新。' : '收费记录已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '收费记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFeeAction(
    action: 'MARK_RECORDED' | 'MARK_PAID' | 'CANCEL' | 'COMPLETE_TASK',
    fee?: FeeRecord,
  ) {
    const key = fee ? `${action}:${fee.id}` : 'COMPLETE_TASK';
    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'MARK_RECORDED' && fee
          ? await markRecordedFee(projectId, fee.id)
          : action === 'MARK_PAID' && fee
            ? await markPaidFee(projectId, fee.id)
            : action === 'CANCEL' && fee
              ? await cancelFee(projectId, fee.id)
              : await completeFeeTask(projectId);

      setWorkspace(nextWorkspace);
      setSuccessMessage(
        action === 'MARK_RECORDED'
          ? '收费记录已记账。'
          : action === 'MARK_PAID'
            ? '收费记录已支付。'
            : action === 'CANCEL'
              ? '收费记录已取消。'
              : '收费节点已完成。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '收费动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function resetForm() {
    setEditingFeeId(null);
    setForm(EMPTY_FEE_FORM);
  }

  function prepareEdit(item: FeeRecord) {
    setEditingFeeId(item.id);
    setForm(toFeeFormInput(item));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Development Fees</p>
        <h1>正在加载颜色开发收费模块…</h1>
        <p>收费记录、节点状态和并行任务状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Development Fees</p>
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
            <span>收费节点负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>完成条件</span>
            <strong>{workspace.canCompleteTask ? '可完成' : '未满足'}</strong>
          </div>
          <div className="metadata-item">
            <span>最近记录时间</span>
            <strong>{formatDate(workspace.items[0]?.recordedAt ?? null)}</strong>
          </div>
          <div className="metadata-item">
            <span>最近状态</span>
            <strong>{workspace.items[0] ? getFeeStatusLabel(workspace.items[0].payStatus) : '暂无'}</strong>
          </div>
        </div>
        <p className="muted">系统规则：第 13 步“颜色开发收费”固定金额为 {FIXED_DEVELOPMENT_FEE_AMOUNT} 元，前端已按只读展示。</p>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前颜色开发收费任务已超期。</p>
        ) : null}
        {!workspace.cabinReviewApproved ? (
          <p className="muted">样车驾驶室评审通过后才会激活收费任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Fee Form</p>
            <h2 className="section-title">收费记录表单</h2>
            <p className="muted">创建记录后节点会进入处理中。收费节点完成不阻塞主流程。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <FeeRecordForm
          value={form}
          disabled={!canManage || isReadOnly || isSaving}
          submitLabel={editingFeeId ? '更新收费记录' : '新建收费记录'}
          onChange={setForm}
          onSubmit={() => void handleSaveFee()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Node Completion</p>
            <h2 className="section-title">收费节点完成</h2>
            <p className="muted">至少存在一条已支付收费记录后，才允许完成收费节点。</p>
          </div>
        </div>
        {workspace.completionIssue ? <p className="muted">{workspace.completionIssue}</p> : null}
        <CompleteFeeTaskButton
          disabled={
            actingKey === 'COMPLETE_TASK' || !canShowCompleteFeeTaskButton(user, workspace)
          }
          onClick={() => void handleFeeAction('COMPLETE_TASK')}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Fee Records</p>
            <h2 className="section-title">收费记录列表</h2>
            <p className="muted">按时间倒序展示，支持记账、支付、取消和备注查看。</p>
          </div>
        </div>
        <FeeRecordTable
          items={workspace.items}
          canManage={canManage}
          isReadOnly={isReadOnly}
          actingKey={actingKey}
          onEdit={prepareEdit}
          onMarkRecorded={(item) => void handleFeeAction('MARK_RECORDED', item)}
          onMarkPaid={(item) => void handleFeeAction('MARK_PAID', item)}
          onCancel={(item) => void handleFeeAction('CANCEL', item)}
        />
      </section>
    </div>
  );
}

export function FeeRecordForm({
  value,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: FeeFormInput;
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: FeeFormInput) => void;
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
        <span>费用类型</span>
        <select
          disabled
          value={value.feeType}
          onChange={() => undefined}
        >
          <option value="PAINT_DEVELOPMENT">涂料开发</option>
        </select>
      </label>
      <label className="field">
        <span>金额</span>
        <input
          required
          disabled
          value={value.amount}
          onChange={() => undefined}
        />
      </label>
      <label className="field">
        <span>币种</span>
        <input
          required
          disabled={disabled}
          value={value.currency}
          onChange={(event) => onChange({ ...value, currency: event.target.value })}
        />
      </label>
      <label className="field">
        <span>付款方</span>
        <input
          required
          disabled={disabled}
          value={value.payer}
          onChange={(event) => onChange({ ...value, payer: event.target.value })}
        />
      </label>
      <label className="field">
        <span>收费状态</span>
        <select disabled value={value.payStatus} onChange={() => undefined}>
          <option value="PENDING">待处理</option>
          <option value="RECORDED">已记账</option>
          <option value="PAID">已支付</option>
          <option value="CANCELLED">已取消</option>
        </select>
      </label>
      <label className="field">
        <span>记录时间</span>
        <input
          required
          type="datetime-local"
          disabled={disabled}
          value={value.recordedAt}
          onChange={(event) => onChange({ ...value, recordedAt: event.target.value })}
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
      <p className="muted field field-full">固定收费金额 10000 元由前端锁定显示，提交时会按系统规则写入。</p>
      <div className="field field-actions">
        <button type="submit" className="button" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function FeeRecordTable({
  items,
  canManage,
  isReadOnly,
  actingKey,
  onEdit,
  onMarkRecorded,
  onMarkPaid,
  onCancel,
}: {
  items: FeeRecord[];
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onEdit: (item: FeeRecord) => void;
  onMarkRecorded: (item: FeeRecord) => void;
  onMarkPaid: (item: FeeRecord) => void;
  onCancel: (item: FeeRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>费用类型</th>
            <th>金额</th>
            <th>付款方</th>
            <th>状态</th>
            <th>记录人</th>
            <th>记录时间</th>
            <th>备注</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>暂无收费记录</strong>
                  <p>驾驶室评审通过并激活收费任务后，可在这里创建收费记录。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{getFeeTypeLabel(item.feeType)}</td>
                <td>{item.amount} {item.currency}</td>
                <td>{item.payer ?? '未填写'}</td>
                <td>
                  <FeeStatusBadge status={item.payStatus} />
                </td>
                <td>{item.recordedByName ?? item.createdByName ?? '未填写'}</td>
                <td>{formatDate(item.recordedAt)}</td>
                <td>{item.note ?? '无'}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        {item.payStatus !== 'PAID' && item.payStatus !== 'CANCELLED' ? (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={() => onEdit(item)}
                          >
                            编辑
                          </button>
                        ) : null}
                        {item.payStatus === 'PENDING' ? (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            disabled={actingKey === `MARK_RECORDED:${item.id}`}
                            onClick={() => onMarkRecorded(item)}
                          >
                            {actingKey === `MARK_RECORDED:${item.id}` ? '处理中…' : '记账'}
                          </button>
                        ) : null}
                        {(item.payStatus === 'PENDING' || item.payStatus === 'RECORDED') ? (
                          <button
                            type="button"
                            className="button button-small"
                            disabled={actingKey === `MARK_PAID:${item.id}`}
                            onClick={() => onMarkPaid(item)}
                          >
                            {actingKey === `MARK_PAID:${item.id}` ? '处理中…' : '标记已支付'}
                          </button>
                        ) : null}
                        {(item.payStatus === 'PENDING' || item.payStatus === 'RECORDED') ? (
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            disabled={actingKey === `CANCEL:${item.id}`}
                            onClick={() => onCancel(item)}
                          >
                            {actingKey === `CANCEL:${item.id}` ? '处理中…' : '取消'}
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

export function FeeStatusBadge({
  status,
}: {
  status: FeeRecord['payStatus'];
}) {
  const className =
    status === 'PAID'
      ? 'status-pill status-pill-success'
      : status === 'RECORDED'
        ? 'status-pill status-pill-warning'
        : status === 'CANCELLED'
          ? 'status-pill status-pill-danger'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getFeeStatusLabel(status)}</span>;
}

export function CompleteFeeTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成收费节点
    </button>
  );
}
