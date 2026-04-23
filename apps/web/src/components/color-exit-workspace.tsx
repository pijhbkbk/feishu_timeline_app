'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';
import {
  canManageColorExit,
  canShowCompleteColorExitButton,
  completeColorExitRecord,
  createColorExitRecord,
  fetchColorExitWorkspace,
  getColorExitSuggestionLabel,
  getColorExitWorkspaceHighlights,
  toColorExitFormInput,
  updateColorExitRecord,
  validateColorExitForm,
  type ColorExitFormInput,
  type ColorExitRecord,
  type ColorExitWorkspaceResponse,
} from '../lib/color-exits-client';
import { formatDate } from '../lib/projects-client';
import { isWorkflowTaskOverdue } from '../lib/workflows-client';

type ColorExitWorkspaceProps = {
  projectId: string;
};

const EMPTY_FORM: ColorExitFormInput = {
  exitDate: '',
  statisticYear: '',
  annualOutput: '',
  finalDecision: '',
  effectiveDate: '',
  exitReason: '',
  description: '',
  replacementColorId: '',
};

const COLOR_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '启用',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
  EXITED: '已退出',
};

export function ColorExitWorkspace({ projectId }: ColorExitWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<ColorExitWorkspaceResponse | null>(null);
  const [editingExitId, setEditingExitId] = useState<string | null>(null);
  const [selectedExitId, setSelectedExitId] = useState<string | null>(null);
  const [form, setForm] = useState<ColorExitFormInput>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.items.length) {
      setSelectedExitId(null);
      return;
    }

    const nextExitId =
      selectedExitId && workspace.items.some((item) => item.id === selectedExitId)
        ? selectedExitId
        : (workspace.items[0]?.id ?? null);

    if (nextExitId !== selectedExitId) {
      setSelectedExitId(nextExitId);
    }
  }, [selectedExitId, workspace]);

  const canManage = canManageColorExit(user);
  const highlights = workspace ? getColorExitWorkspaceHighlights(workspace) : null;
  const selectedRecord =
    workspace?.items.find((item) => item.id === selectedExitId) ?? workspace?.items[0] ?? null;
  const isReadOnly = !workspace?.activeTask;
  const annualOutputValue =
    form.annualOutput.trim() && /^\d+$/.test(form.annualOutput.trim())
      ? Number(form.annualOutput)
      : null;
  const previewSuggestion =
    annualOutputValue == null || !workspace
      ? null
      : annualOutputValue <= workspace.defaultExitThreshold
        ? 'EXIT'
        : 'RETAIN';

  const summaryCards = useMemo(
    () => [
      {
        label: '颜色退出任务',
        value: highlights?.activeTaskStatusLabel ?? '当前无颜色退出任务',
      },
      {
        label: '目视色差评审',
        value: workspace?.visualDeltaApproved ? '已通过' : '未通过',
      },
      {
        label: '项目状态',
        value: workspace?.project.status ?? '未知',
      },
      {
        label: '退出记录数',
        value: String(workspace?.items.length ?? 0),
      },
      {
        label: '退出阈值',
        value: highlights?.defaultExitThresholdLabel ?? '-',
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
      const response = await fetchColorExitWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '颜色退出工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    const validationMessage = validateColorExitForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingExitId
        ? await updateColorExitRecord(projectId, editingExitId, form)
        : await createColorExitRecord(projectId, form);

      setWorkspace(nextWorkspace);
      setEditingExitId(null);
      setForm(EMPTY_FORM);
      setSuccessMessage(editingExitId ? '颜色退出记录已更新。' : '颜色退出记录已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '颜色退出记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleComplete(record: ColorExitRecord) {
    setActingKey(`complete:${record.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await completeColorExitRecord(projectId, record.id);
      setWorkspace(nextWorkspace);
      setSuccessMessage('颜色退出已完成，项目已收尾。');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '颜色退出完成失败。');
    } finally {
      setActingKey(null);
    }
  }

  function resetForm() {
    setEditingExitId(null);
    setForm(EMPTY_FORM);
  }

  function prepareEdit(record: ColorExitRecord) {
    if (record.completedAt) {
      return;
    }

    setEditingExitId(record.id);
    setSelectedExitId(record.id);
    setForm(toColorExitFormInput(record));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Color Exit</p>
        <h1>正在加载颜色退出模块…</h1>
        <p>退出记录、颜色主数据状态和项目收尾信息正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Color Exit</p>
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
            <Link href={`/projects/${projectId}/color-evaluation`} className="button button-secondary">
              查看色差评审
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
            <span>当前颜色</span>
            <strong>{workspace.currentColor?.name ?? '未绑定正式颜色'}</strong>
          </div>
          <div className="metadata-item">
            <span>颜色状态</span>
            <strong>{workspace.currentColor ? getColorStatusLabel(workspace.currentColor.status) : '无'}</strong>
          </div>
          <div className="metadata-item">
            <span>退出日期</span>
            <strong>{formatDate(selectedRecord?.exitDate ?? null)}</strong>
          </div>
          <div className="metadata-item">
            <span>系统建议</span>
            <strong>{getColorExitSuggestionLabel(selectedRecord?.systemSuggestion)}</strong>
          </div>
          <div className="metadata-item">
            <span>人工结论</span>
            <strong>{getColorExitSuggestionLabel(selectedRecord?.finalDecision)}</strong>
          </div>
          <div className="metadata-item">
            <span>项目完成时间</span>
            <strong>{formatDate(workspace.project.actualEndDate)}</strong>
          </div>
        </div>
        <div className="summary-grid">
          <div className="summary-card" data-testid="color-exit-output-card">
            <span>当前录入年产量</span>
            <strong>{selectedRecord?.annualOutput ?? '未录入'}</strong>
          </div>
          <div className="summary-card" data-testid="color-exit-threshold-card">
            <span>系统退出阈值</span>
            <strong>{workspace.defaultExitThreshold} 台</strong>
          </div>
          <div className="summary-card" data-testid="color-exit-suggestion-card">
            <span>系统建议</span>
            <strong>{getColorExitSuggestionLabel(selectedRecord?.systemSuggestion)}</strong>
          </div>
          <div className="summary-card" data-testid="color-exit-decision-card">
            <span>人工结论</span>
            <strong>{getColorExitSuggestionLabel(selectedRecord?.finalDecision)}</strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <FeedbackBanner variant="warning" compact title="节点风险" message="当前颜色退出任务已超期。" />
        ) : null}
        {!workspace.visualDeltaApproved ? (
          <p className="muted">目视色差评审通过后才会激活颜色退出任务。</p>
        ) : null}
      </section>

      {error ? <FeedbackBanner variant="error" title="退出操作失败" message={error} /> : null}
      {successMessage ? (
        <FeedbackBanner variant="success" title="退出操作已完成" message={successMessage} />
      ) : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Exit Form</p>
            <h2 className="section-title">颜色退出表单</h2>
            <p className="muted">填写退出原因、说明和替代颜色后，再完成颜色退出节点。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <div className="review-form-shell" data-testid="color-exit-form">
          <FeedbackBanner
            variant="info"
            compact
            title="录入口径"
            message="保存记录只会更新退出台账；点击“完成颜色退出”才会真正完成第 18 步并收尾项目。"
          />
          <ColorExitForm
            value={form}
            replacementOptions={workspace.replacementOptions}
            defaultExitThreshold={workspace.defaultExitThreshold}
            previewSuggestion={previewSuggestion}
            disabled={!canManage || isReadOnly || isSaving}
            submitLabel={editingExitId ? '更新退出记录' : '新建退出记录'}
            onChange={setForm}
            onSubmit={() => void handleSave()}
          />
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Exit Summary</p>
            <h2 className="section-title">退出摘要</h2>
            <p className="muted">完成后项目状态应为已完成，颜色主数据状态应为已退出。</p>
          </div>
        </div>
        <ColorExitSummaryCard
          workspace={workspace}
          record={selectedRecord}
          canManage={canManage}
          canComplete={canShowCompleteColorExitButton(user, workspace, selectedRecord)}
          actingKey={actingKey}
          onEdit={prepareEdit}
          onComplete={(record) => void handleComplete(record)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Exit Records</p>
            <h2 className="section-title">退出记录</h2>
            <p className="muted">展示退出原因、替代颜色和完成状态。</p>
          </div>
        </div>
        <div className="table-shell table-shell-scroll">
          <table className="data-table">
            <thead>
                  <tr>
                    <th>退出日期</th>
                    <th>统计年度</th>
                    <th>年产量</th>
                    <th>系统建议</th>
                    <th>人工结论</th>
                    <th>退出原因</th>
                    <th>当前颜色</th>
                    <th>替代颜色</th>
                    <th>操作人</th>
                    <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {workspace.items.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <StatePanel
                      compact
                      title="暂无退出记录"
                      description="色差目视评审通过并激活颜色退出任务后，可在这里创建退出记录。"
                    />
                  </td>
                </tr>
              ) : (
                workspace.items.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedExitId === item.id ? 'row-selected' : undefined}
                    onClick={() => setSelectedExitId(item.id)}
                  >
                    <td>{formatDate(item.exitDate)}</td>
                    <td>{item.statisticYear ?? '未填写'}</td>
                    <td>{item.annualOutput ?? '未填写'}</td>
                    <td>{getColorExitSuggestionLabel(item.systemSuggestion)}</td>
                    <td>{getColorExitSuggestionLabel(item.finalDecision)}</td>
                    <td>{item.exitReason}</td>
                    <td>{item.colorName ?? '未绑定'}</td>
                    <td>{item.replacementColorName ?? '无'}</td>
                    <td>{item.operatorName ?? '未指定'}</td>
                    <td>
                      <ExitStatusBadge completed={Boolean(item.completedAt)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ColorExitForm({
  value,
  replacementOptions,
  defaultExitThreshold,
  previewSuggestion,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: ColorExitFormInput;
  replacementOptions: ColorExitWorkspaceResponse['replacementOptions'];
  defaultExitThreshold: number;
  previewSuggestion: 'EXIT' | 'RETAIN' | null;
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: ColorExitFormInput) => void;
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
      <div className="field field-full">
        <div className="review-decision-grid" aria-label="退出结论提示">
          <div
            className={`review-decision-card${
              value.finalDecision === 'EXIT' ? ' review-decision-card-active' : ''
            }`}
          >
            <strong>退出</strong>
            <p>低于阈值且业务确认停用时使用。</p>
          </div>
          <div
            className={`review-decision-card${
              value.finalDecision === 'RETAIN' ? ' review-decision-card-active' : ''
            }`}
          >
            <strong>保留</strong>
            <p>仍有产量支撑，颜色继续保留。</p>
          </div>
          <div
            className={`review-decision-card${
              value.finalDecision === 'OBSERVE' ? ' review-decision-card-active' : ''
            }`}
          >
            <strong>延期观察</strong>
            <p>年产量与业务判断暂不适合直接退出。</p>
          </div>
        </div>
      </div>
      <label className="field">
        <span>退出日期</span>
        <input
          required
          type="date"
          disabled={disabled}
          value={value.exitDate}
          onChange={(event) => onChange({ ...value, exitDate: event.target.value })}
        />
      </label>
      <label className="field">
        <span>统计年度</span>
        <input
          type="number"
          min={2000}
          max={9999}
          disabled={disabled}
          value={value.statisticYear}
          onChange={(event) => onChange({ ...value, statisticYear: event.target.value })}
        />
      </label>
      <label className="field">
        <span>年产量</span>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={value.annualOutput}
          onChange={(event) => onChange({ ...value, annualOutput: event.target.value })}
        />
        <small className="field-hint">系统会用年产量和退出阈值自动给出建议。</small>
      </label>
      <label className="field field-full">
        <span>退出原因</span>
        <input
          required
          disabled={disabled}
          value={value.exitReason}
          onChange={(event) => onChange({ ...value, exitReason: event.target.value })}
        />
      </label>
      <label className="field field-full">
        <span>人工结论</span>
        <select
          disabled={disabled}
          value={value.finalDecision}
          onChange={(event) =>
            onChange({
              ...value,
              finalDecision: event.target.value as ColorExitFormInput['finalDecision'],
            })
          }
        >
          <option value="">请选择</option>
          <option value="EXIT">退出</option>
          <option value="RETAIN">保留</option>
          <option value="OBSERVE">延期观察</option>
        </select>
        <small className="field-hint">人工结论用于记录最终业务判断，不会覆盖系统建议。</small>
      </label>
      <label className="field">
        <span>生效日期</span>
        <input
          type="date"
          disabled={disabled}
          value={value.effectiveDate}
          onChange={(event) => onChange({ ...value, effectiveDate: event.target.value })}
        />
      </label>
      <div className="detail-block field field-full">
        <h3>退出建议</h3>
        <p>
          当前阈值 {defaultExitThreshold} 台。
          {previewSuggestion
            ? `按已录入年产量，系统建议为${getColorExitSuggestionLabel(previewSuggestion)}。`
            : '录入年产量后，系统会自动计算建议。'}
        </p>
      </div>
      <label className="field field-full">
        <span>退出说明</span>
        <textarea
          rows={4}
          disabled={disabled}
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
        <small className="field-hint">建议补充库存、替代颜色和销售策略影响。</small>
      </label>
      <label className="field field-full">
        <span>替代颜色</span>
        <select
          disabled={disabled}
          value={value.replacementColorId}
          onChange={(event) => onChange({ ...value, replacementColorId: event.target.value })}
        >
          <option value="">无</option>
          {replacementOptions.map((color) => (
            <option key={color.id} value={color.id}>
              {color.name}
              {color.code ? ` (${color.code})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="field field-actions">
        <button type="submit" className="button button-primary" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function ColorExitSummaryCard({
  workspace,
  record,
  canManage,
  canComplete,
  actingKey,
  onEdit,
  onComplete,
}: {
  workspace: ColorExitWorkspaceResponse;
  record: ColorExitRecord | null;
  canManage: boolean;
  canComplete: boolean;
  actingKey: string | null;
  onEdit: (record: ColorExitRecord) => void;
  onComplete: (record: ColorExitRecord) => void;
}) {
  if (!record) {
    return (
      <StatePanel
        title="暂无退出摘要"
        description="创建颜色退出记录后，这里会展示当前退出状态和主数据更新情况。"
      />
    );
  }

  return (
    <div className="page-stack compact">
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>当前颜色</span>
          <strong>{record.colorName ?? '未绑定'}</strong>
        </div>
        <div className="metadata-item">
          <span>替代颜色</span>
          <strong>{record.replacementColorName ?? '无'}</strong>
        </div>
        <div className="metadata-item">
          <span>操作人</span>
          <strong>{record.operatorName ?? '未指定'}</strong>
        </div>
        <div className="metadata-item">
          <span>退出状态</span>
          <strong>{record.completedAt ? '已完成' : '待完成'}</strong>
        </div>
        <div className="metadata-item">
          <span>统计年度</span>
          <strong>{record.statisticYear ?? '未填写'}</strong>
        </div>
        <div className="metadata-item">
          <span>年产量</span>
          <strong>{record.annualOutput ?? '未填写'}</strong>
        </div>
        <div className="metadata-item">
          <span>系统建议</span>
          <strong>{getColorExitSuggestionLabel(record.systemSuggestion)}</strong>
        </div>
        <div className="metadata-item">
          <span>人工结论</span>
          <strong>{getColorExitSuggestionLabel(record.finalDecision)}</strong>
        </div>
      </div>
      <div className="detail-block">
        <h3>退出原因</h3>
        <p>{record.exitReason}</p>
      </div>
      <div className="detail-block">
        <h3>生效日期</h3>
        <p>{formatDate(record.effectiveDate)}</p>
      </div>
      <div className="detail-block">
        <h3>退出说明</h3>
        <p>{record.description ?? '无'}</p>
      </div>
      {workspace.completionIssue ? (
        <FeedbackBanner variant="warning" compact title="完成前检查" message={workspace.completionIssue} />
      ) : null}
      <div className="inline-actions">
        {canManage && !record.completedAt ? (
          <button type="button" className="button button-secondary" onClick={() => onEdit(record)}>
            编辑退出记录
          </button>
        ) : null}
        <button
          type="button"
          className="button button-danger"
          disabled={!canComplete || actingKey === `complete:${record.id}`}
          onClick={() => onComplete(record)}
        >
          {actingKey === `complete:${record.id}` ? '处理中…' : '完成颜色退出'}
        </button>
      </div>
    </div>
  );
}

export function ExitStatusBadge({ completed }: { completed: boolean }) {
  return (
    <span
      className={
        completed ? 'status-pill status-pill-success' : 'status-pill status-pill-warning'
      }
    >
      {completed ? '已完成' : '待完成'}
    </span>
  );
}

function getColorStatusLabel(status: string) {
  return COLOR_STATUS_LABELS[status] ?? status;
}
