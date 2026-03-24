'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  addTrialProductionIssue,
  canManagePilotProductions,
  canShowCompleteFirstProductionPlanTaskButton,
  canShowCompleteTrialProductionTaskButton,
  completeFirstProductionPlanTask,
  completeTrialProductionRecord,
  completeTrialProductionTask,
  confirmFirstProductionPlan,
  createFirstProductionPlan,
  createTrialProduction,
  fetchFirstProductionPlanWorkspace,
  fetchPilotProductionPageOptions,
  fetchTrialProductionWorkspace,
  getDefaultProductionOwnerId,
  getDefaultTrialPlanId,
  getFirstProductionPlanStatusLabel,
  getPilotProductionWorkspaceHighlights,
  getTrialProductionIssueSeverityLabel,
  getTrialProductionResultLabel,
  getTrialProductionStatusLabel,
  updateFirstProductionPlan,
  updateTrialProduction,
  validateFirstProductionPlanForm,
  validateTrialProductionForm,
  validateTrialProductionIssueForm,
  TRIAL_PRODUCTION_ISSUE_SEVERITY_OPTIONS,
  TRIAL_PRODUCTION_RESULT_OPTIONS,
  type FirstProductionPlanFormInput,
  type FirstProductionPlanRecord,
  type FirstProductionPlanStatus,
  type FirstProductionPlanWorkspaceResponse,
  type TrialProductionFormInput,
  type TrialProductionIssueFormInput,
  type TrialProductionRecord,
  type TrialProductionStatus,
  type TrialProductionWorkspaceResponse,
} from '../lib/pilot-productions-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';
import { getWorkflowTaskStatusLabel, isWorkflowTaskOverdue } from '../lib/workflows-client';

type PilotProductionWorkspaceProps = {
  projectId: string;
};

const EMPTY_FIRST_PRODUCTION_PLAN_FORM: FirstProductionPlanFormInput = {
  planDate: '',
  plannedQuantity: '',
  workshop: '',
  lineName: '',
  ownerId: '',
  batchNo: '',
  note: '',
};

const EMPTY_TRIAL_PRODUCTION_FORM: TrialProductionFormInput = {
  productionPlanId: '',
  vehicleNo: '',
  workshop: '',
  trialDate: '',
  paintBatchNo: '',
  result: '',
  issueSummary: '',
  note: '',
};

const EMPTY_TRIAL_PRODUCTION_ISSUE_FORM: TrialProductionIssueFormInput = {
  issueType: '',
  description: '',
  severity: 'MEDIUM',
  responsibleDept: '',
};

export function PilotProductionWorkspace({
  projectId,
}: PilotProductionWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [firstPlanWorkspace, setFirstPlanWorkspace] =
    useState<FirstProductionPlanWorkspaceResponse | null>(null);
  const [trialWorkspace, setTrialWorkspace] =
    useState<TrialProductionWorkspaceResponse | null>(null);
  const [userOptions, setUserOptions] = useState<DirectoryUser[]>([]);
  const [planForm, setPlanForm] =
    useState<FirstProductionPlanFormInput>(EMPTY_FIRST_PRODUCTION_PLAN_FORM);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [trialForm, setTrialForm] =
    useState<TrialProductionFormInput>(EMPTY_TRIAL_PRODUCTION_FORM);
  const [editingTrialId, setEditingTrialId] = useState<string | null>(null);
  const [issueForm, setIssueForm] =
    useState<TrialProductionIssueFormInput>(EMPTY_TRIAL_PRODUCTION_ISSUE_FORM);
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isSavingTrial, setIsSavingTrial] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspaces({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!trialWorkspace?.items.length) {
      setSelectedTrialId(null);
      return;
    }

    const nextTrialId =
      selectedTrialId && trialWorkspace.items.some((item) => item.id === selectedTrialId)
        ? selectedTrialId
        : (trialWorkspace.items[0]?.id ?? null);

    if (nextTrialId !== selectedTrialId) {
      setSelectedTrialId(nextTrialId);
    }
  }, [trialWorkspace, selectedTrialId]);

  const canManage = canManagePilotProductions(user);
  const selectedTrial =
    trialWorkspace?.items.find((item) => item.id === selectedTrialId) ?? null;
  const highlights =
    firstPlanWorkspace && trialWorkspace
      ? getPilotProductionWorkspaceHighlights({
          project: firstPlanWorkspace.project,
          firstPlanTask: firstPlanWorkspace.activeTask,
          trialTask: trialWorkspace.activeTask,
        })
      : null;
  const firstPlanReadOnly = !firstPlanWorkspace?.activeTask;
  const trialReadOnly = !trialWorkspace?.activeTask;
  const planRows = firstPlanWorkspace?.items ?? [];
  const trialRows = trialWorkspace?.items ?? [];

  const firstPlanSummaryCards = useMemo(
    () => [
      {
        label: '采购完成状态',
        value: firstPlanWorkspace?.procurementCompleted ? '已完成' : '未完成',
      },
      {
        label: '首台计划任务',
        value: highlights?.firstPlanTaskStatusLabel ?? '当前无首台计划任务',
      },
      {
        label: '样车试制任务',
        value: highlights?.trialTaskStatusLabel ?? '当前无样车试制任务',
      },
      {
        label: '驾驶室评审',
        value: trialWorkspace?.downstreamCabReviewTask
          ? getWorkflowTaskStatusLabel(trialWorkspace.downstreamCabReviewTask.status)
          : '未激活',
      },
    ],
    [firstPlanWorkspace, highlights, trialWorkspace],
  );

  async function loadWorkspaces(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const [nextFirstPlanWorkspace, nextTrialWorkspace, nextUsers] = await Promise.all([
        fetchFirstProductionPlanWorkspace(projectId),
        fetchTrialProductionWorkspace(projectId),
        fetchPilotProductionPageOptions(),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setFirstPlanWorkspace(nextFirstPlanWorkspace);
      setTrialWorkspace(nextTrialWorkspace);
      setUserOptions(nextUsers);
      setPlanForm((current) => ({
        ...current,
        ownerId:
          current.ownerId && nextUsers.some((user) => user.id === current.ownerId)
            ? current.ownerId
            : getDefaultProductionOwnerId(nextUsers, user?.id ?? null),
      }));
      setTrialForm((current) => ({
        ...current,
        productionPlanId:
          current.productionPlanId &&
          nextTrialWorkspace.planOptions.some((plan) => plan.id === current.productionPlanId)
            ? current.productionPlanId
            : getDefaultTrialPlanId(nextTrialWorkspace),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '首台计划/样车试制工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSaveFirstPlan() {
    const validationMessage = validateFirstProductionPlanForm(planForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSavingPlan(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingPlanId) {
        await updateFirstProductionPlan(projectId, editingPlanId, planForm);
        setSuccessMessage('首台计划已更新。');
      } else {
        await createFirstProductionPlan(projectId, planForm);
        setSuccessMessage('首台计划已创建。');
      }

      setEditingPlanId(null);
      setPlanForm({
        ...EMPTY_FIRST_PRODUCTION_PLAN_FORM,
        ownerId: getDefaultProductionOwnerId(userOptions, user?.id ?? null),
      });
      await loadWorkspaces();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '首台计划保存失败。');
    } finally {
      setIsSavingPlan(false);
    }
  }

  async function handleFirstPlanAction(
    action: 'CONFIRM' | 'COMPLETE_TASK',
    plan?: FirstProductionPlanRecord,
  ) {
    const key =
      action === 'CONFIRM' && plan ? `confirm-plan:${plan.id}` : 'complete-first-plan-task';
    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      if (action === 'CONFIRM' && plan) {
        await confirmFirstProductionPlan(projectId, plan.id);
        setSuccessMessage(`首台计划 ${plan.planNo} 已确认。`);
      } else {
        await completeFirstProductionPlanTask(projectId);
        setSuccessMessage('首台生产计划节点已完成，样车试制已激活。');
      }

      await loadWorkspaces();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '首台计划动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleSaveTrial() {
    const validationMessage = validateTrialProductionForm(trialForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSavingTrial(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingTrialId) {
        await updateTrialProduction(projectId, editingTrialId, trialForm);
        setSuccessMessage('试制记录已更新。');
      } else {
        await createTrialProduction(projectId, trialForm);
        setSuccessMessage('试制记录已创建。');
      }

      setEditingTrialId(null);
      setTrialForm({
        ...EMPTY_TRIAL_PRODUCTION_FORM,
        productionPlanId: getDefaultTrialPlanId(trialWorkspace),
      });
      await loadWorkspaces();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '试制记录保存失败。');
    } finally {
      setIsSavingTrial(false);
    }
  }

  async function handleAddIssue() {
    if (!selectedTrial) {
      setError('请先选择一条试制记录。');
      return;
    }

    const validationMessage = validateTrialProductionIssueForm(issueForm);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setActingKey(`add-issue:${selectedTrial.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      await addTrialProductionIssue(projectId, selectedTrial.id, issueForm);
      setIssueForm(EMPTY_TRIAL_PRODUCTION_ISSUE_FORM);
      setSuccessMessage(`试制记录 ${selectedTrial.vehicleNo} 已新增问题。`);
      await loadWorkspaces();
    } catch (addIssueError) {
      setError(addIssueError instanceof Error ? addIssueError.message : '试制问题新增失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleTrialAction(
    action: 'COMPLETE_RECORD' | 'COMPLETE_TASK',
    trial?: TrialProductionRecord,
  ) {
    const key =
      action === 'COMPLETE_RECORD' && trial
        ? `complete-trial:${trial.id}`
        : 'complete-trial-task';
    setActingKey(key);
    setError(null);
    setSuccessMessage(null);

    try {
      if (action === 'COMPLETE_RECORD' && trial) {
        await completeTrialProductionRecord(projectId, trial.id);
        setSuccessMessage(`试制记录 ${trial.vehicleNo} 已完成。`);
      } else {
        await completeTrialProductionTask(projectId);
        setSuccessMessage('样车试制节点已完成，驾驶室评审已激活。');
      }

      await loadWorkspaces();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '试制动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  function prepareEditPlan(plan: FirstProductionPlanRecord) {
    setEditingPlanId(plan.id);
    setPlanForm({
      planDate: toDateInputValue(plan.planDate),
      plannedQuantity: plan.plannedQuantity ? String(plan.plannedQuantity) : '',
      workshop: plan.workshop ?? '',
      lineName: plan.lineName ?? '',
      ownerId: plan.ownerId ?? '',
      batchNo: plan.batchNo ?? '',
      note: plan.note ?? '',
    });
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanForm({
      ...EMPTY_FIRST_PRODUCTION_PLAN_FORM,
      ownerId: getDefaultProductionOwnerId(userOptions, user?.id ?? null),
    });
  }

  function prepareEditTrial(trial: TrialProductionRecord) {
    setEditingTrialId(trial.id);
    setSelectedTrialId(trial.id);
    setTrialForm({
      productionPlanId: trial.productionPlanId ?? '',
      vehicleNo: trial.vehicleNo,
      workshop: trial.workshop ?? '',
      trialDate: toDateInputValue(trial.trialDate),
      paintBatchNo: trial.paintBatchNo ?? '',
      result: trial.result ?? '',
      issueSummary: trial.issueSummary ?? '',
      note: trial.note ?? '',
    });
  }

  function resetTrialForm() {
    setEditingTrialId(null);
    setTrialForm({
      ...EMPTY_TRIAL_PRODUCTION_FORM,
      productionPlanId: getDefaultTrialPlanId(trialWorkspace),
    });
  }

  if (isLoading || !firstPlanWorkspace || !trialWorkspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Pilot Production</p>
        <h1>正在加载首台生产计划与样车试制模块…</h1>
        <p>首台计划、试制记录、问题清单和流程状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Pilot Production</p>
            <h2 className="section-title">{firstPlanWorkspace.project.name}</h2>
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
              onClick={() => void loadWorkspaces()}
            >
              {isRefreshing ? '刷新中…' : '刷新'}
            </button>
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              查看流程
            </Link>
          </div>
        </div>
        <div className="summary-grid">
          {firstPlanSummaryCards.map((item) => (
            <div key={item.label} className="summary-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        {firstPlanWorkspace.activeTask && isWorkflowTaskOverdue(firstPlanWorkspace.activeTask) ? (
          <p className="error-text">当前首台生产计划任务已超期。</p>
        ) : null}
        {trialWorkspace.activeTask && isWorkflowTaskOverdue(trialWorkspace.activeTask) ? (
          <p className="error-text">当前样车试制任务已超期。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Task Completion</p>
            <h2 className="section-title">节点完成条件</h2>
            <p className="muted">
              首台计划至少有一条已确认记录后才能完成节点；样车试制至少有一条有效试制记录后才能完成节点。
            </p>
          </div>
        </div>
        {firstPlanWorkspace.completionIssue ? (
          <p className="muted">{firstPlanWorkspace.completionIssue}</p>
        ) : null}
        {trialWorkspace.completionIssue ? (
          <p className="muted">{trialWorkspace.completionIssue}</p>
        ) : null}
        <div className="inline-actions">
          <CompleteFirstPlanTaskButton
            disabled={
              actingKey === 'complete-first-plan-task' ||
              !canShowCompleteFirstProductionPlanTaskButton(user, firstPlanWorkspace)
            }
            onClick={() => void handleFirstPlanAction('COMPLETE_TASK')}
          />
          <CompleteTrialProductionTaskButton
            disabled={
              actingKey === 'complete-trial-task' ||
              !canShowCompleteTrialProductionTaskButton(user, trialWorkspace)
            }
            onClick={() => void handleTrialAction('COMPLETE_TASK')}
          />
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">First Production Plan</p>
            <h2 className="section-title">首台生产计划</h2>
            <p className="muted">采购完成后进入首台计划阶段，可创建、编辑、确认首台计划。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetPlanForm}>
              重置首台计划表单
            </button>
          </div>
        </div>
        <FirstProductionPlanForm
          value={planForm}
          ownerOptions={userOptions}
          disabled={!canManage || firstPlanReadOnly || isSavingPlan}
          submitLabel={editingPlanId ? '更新首台计划' : '新建首台计划'}
          onChange={setPlanForm}
          onSubmit={() => void handleSaveFirstPlan()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Plan Records</p>
            <h2 className="section-title">首台计划列表</h2>
            <p className="muted">首台计划确认后，才允许完成当前主节点并进入样车试制。</p>
          </div>
        </div>
        <FirstProductionPlanTable
          items={planRows}
          canManage={canManage}
          isReadOnly={firstPlanReadOnly}
          actingKey={actingKey}
          onEdit={prepareEditPlan}
          onConfirm={(plan) => void handleFirstPlanAction('CONFIRM', plan)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Trial Production</p>
            <h2 className="section-title">样车试制记录</h2>
            <p className="muted">首台节点完成后进入样车试制，可维护试制记录并补充试制问题。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetTrialForm}>
              重置试制表单
            </button>
          </div>
        </div>
        <TrialProductionForm
          value={trialForm}
          planOptions={trialWorkspace.planOptions}
          disabled={!canManage || trialReadOnly || isSavingTrial}
          submitLabel={editingTrialId ? '更新试制记录' : '新建试制记录'}
          onChange={setTrialForm}
          onSubmit={() => void handleSaveTrial()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Trial Records</p>
            <h2 className="section-title">试制记录列表</h2>
            <p className="muted">选择一条试制记录后，可查看问题列表并继续补充问题信息。</p>
          </div>
        </div>
        <TrialProductionList
          items={trialRows}
          selectedTrialId={selectedTrialId}
          canManage={canManage}
          isReadOnly={trialReadOnly}
          actingKey={actingKey}
          onSelect={setSelectedTrialId}
          onEdit={prepareEditTrial}
          onCompleteRecord={(trial) => void handleTrialAction('COMPLETE_RECORD', trial)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Trial Issues</p>
            <h2 className="section-title">试制问题记录</h2>
            <p className="muted">允许为每条试制记录补充多条问题项，用于后续评审追踪。</p>
          </div>
        </div>
        {selectedTrial ? (
          <div className="page-stack">
            <div className="detail-grid">
              <div className="detail-item">
                <span>样车编号</span>
                <strong>{selectedTrial.vehicleNo}</strong>
              </div>
              <div className="detail-item">
                <span>试制结果</span>
                <strong>{getTrialProductionResultLabel(selectedTrial.result)}</strong>
              </div>
              <div className="detail-item">
                <span>状态</span>
                <strong>{getTrialProductionStatusLabel(selectedTrial.status)}</strong>
              </div>
              <div className="detail-item detail-item-full">
                <span>问题摘要</span>
                <strong>{selectedTrial.issueSummary ?? '未填写'}</strong>
              </div>
            </div>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddIssue();
              }}
            >
              <label className="field">
                <span>问题类型</span>
                <input
                  disabled={!canManage || trialReadOnly || actingKey === `add-issue:${selectedTrial.id}`}
                  value={issueForm.issueType}
                  onChange={(event) =>
                    setIssueForm((current) => ({
                      ...current,
                      issueType: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>严重度</span>
                <select
                  disabled={!canManage || trialReadOnly || actingKey === `add-issue:${selectedTrial.id}`}
                  value={issueForm.severity}
                  onChange={(event) =>
                    setIssueForm((current) => ({
                      ...current,
                      severity: event.target.value as TrialProductionIssueFormInput['severity'],
                    }))
                  }
                >
                  {TRIAL_PRODUCTION_ISSUE_SEVERITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>责任部门</span>
                <input
                  disabled={!canManage || trialReadOnly || actingKey === `add-issue:${selectedTrial.id}`}
                  value={issueForm.responsibleDept}
                  onChange={(event) =>
                    setIssueForm((current) => ({
                      ...current,
                      responsibleDept: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field field-full">
                <span>问题描述</span>
                <textarea
                  rows={4}
                  disabled={!canManage || trialReadOnly || actingKey === `add-issue:${selectedTrial.id}`}
                  value={issueForm.description}
                  onChange={(event) =>
                    setIssueForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="field field-actions">
                <button
                  type="submit"
                  className="button"
                  disabled={!canManage || trialReadOnly || actingKey === `add-issue:${selectedTrial.id}`}
                >
                  {actingKey === `add-issue:${selectedTrial.id}` ? '处理中…' : '新增试制问题'}
                </button>
              </div>
            </form>
            <TrialIssueList items={selectedTrial.issues} />
          </div>
        ) : (
          <div className="empty-state">
            <strong>请选择一条试制记录</strong>
            <p>右侧会展示问题列表和问题录入表单。</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function FirstProductionPlanForm({
  value,
  ownerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: FirstProductionPlanFormInput;
  ownerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: FirstProductionPlanFormInput) => void;
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
          type="number"
          min={1}
          disabled={disabled}
          value={value.plannedQuantity}
          onChange={(event) =>
            onChange({ ...value, plannedQuantity: event.target.value })
          }
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
          disabled={disabled}
          value={value.ownerId}
          onChange={(event) => onChange({ ...value, ownerId: event.target.value })}
        >
          <option value="">请选择责任人</option>
          {ownerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
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
          rows={4}
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

export function FirstProductionPlanTable({
  items,
  canManage,
  isReadOnly,
  actingKey,
  onEdit,
  onConfirm,
}: {
  items: FirstProductionPlanRecord[];
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onEdit: (plan: FirstProductionPlanRecord) => void;
  onConfirm: (plan: FirstProductionPlanRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>计划单号</th>
            <th>计划日期</th>
            <th>数量</th>
            <th>车间/生产线</th>
            <th>责任人</th>
            <th>状态</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">
                  <strong>暂无首台生产计划</strong>
                  <p>采购完成并激活首台任务后，可在这里创建首台计划。</p>
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
                  {item.workshop ?? '未填写'} / {item.lineName ?? '未填写'}
                </td>
                <td>{item.ownerName ?? '未填写'}</td>
                <td>
                  <PlanStatusBadge status={item.status} />
                </td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={item.status !== 'DRAFT'}
                          onClick={() => onEdit(item)}
                        >
                          编辑
                        </button>
                        <ConfirmFirstPlanButton
                          disabled={
                            item.status !== 'DRAFT' ||
                            actingKey === `confirm-plan:${item.id}`
                          }
                          onClick={() => onConfirm(item)}
                        />
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

export function TrialProductionForm({
  value,
  planOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: TrialProductionFormInput;
  planOptions: TrialProductionWorkspaceResponse['planOptions'];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: TrialProductionFormInput) => void;
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
        <span>关联首台计划</span>
        <select
          disabled={disabled}
          value={value.productionPlanId}
          onChange={(event) =>
            onChange({ ...value, productionPlanId: event.target.value })
          }
        >
          <option value="">不关联首台计划</option>
          {planOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.planNo} / {formatDate(option.planDate)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>试制日期</span>
        <input
          required
          type="date"
          disabled={disabled}
          value={value.trialDate}
          onChange={(event) => onChange({ ...value, trialDate: event.target.value })}
        />
      </label>
      <label className="field">
        <span>样车编号</span>
        <input
          required
          disabled={disabled}
          value={value.vehicleNo}
          onChange={(event) => onChange({ ...value, vehicleNo: event.target.value })}
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
        <span>涂料批次</span>
        <input
          required
          disabled={disabled}
          value={value.paintBatchNo}
          onChange={(event) => onChange({ ...value, paintBatchNo: event.target.value })}
        />
      </label>
      <label className="field">
        <span>试制结果</span>
        <select
          disabled={disabled}
          value={value.result}
          onChange={(event) =>
            onChange({
              ...value,
              result: event.target.value as TrialProductionFormInput['result'],
            })
          }
        >
          <option value="">稍后填写</option>
          {TRIAL_PRODUCTION_RESULT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-full">
        <span>问题摘要</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.issueSummary}
          onChange={(event) => onChange({ ...value, issueSummary: event.target.value })}
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

export function TrialProductionList({
  items,
  selectedTrialId,
  canManage,
  isReadOnly,
  actingKey,
  onSelect,
  onEdit,
  onCompleteRecord,
}: {
  items: TrialProductionRecord[];
  selectedTrialId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onSelect: (trialId: string) => void;
  onEdit: (trial: TrialProductionRecord) => void;
  onCompleteRecord: (trial: TrialProductionRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>样车编号</th>
            <th>试制日期</th>
            <th>车间</th>
            <th>涂料批次</th>
            <th>结果</th>
            <th>状态</th>
            <th>问题数</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>暂无试制记录</strong>
                  <p>首台计划节点完成并激活试制任务后，可在这里创建试制记录。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className={selectedTrialId === item.id ? 'row-selected' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <td>{item.vehicleNo}</td>
                <td>{formatDate(item.trialDate)}</td>
                <td>{item.workshop ?? '未填写'}</td>
                <td>{item.paintBatchNo ?? '未填写'}</td>
                <td>{getTrialProductionResultLabel(item.result)}</td>
                <td>
                  <TrialStatusBadge status={item.status} />
                </td>
                <td>{item.issues.length}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly ? (
                      <>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={item.status === 'PASSED' || item.status === 'FAILED' || item.status === 'CANCELLED'}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(item);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={
                            item.status === 'PASSED' ||
                            item.status === 'FAILED' ||
                            item.status === 'CANCELLED' ||
                            actingKey === `complete-trial:${item.id}`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onCompleteRecord(item);
                          }}
                        >
                          {actingKey === `complete-trial:${item.id}` ? '处理中…' : '完成记录'}
                        </button>
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

export function TrialIssueList({
  items,
}: {
  items: TrialProductionRecord['issues'];
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>问题类型</th>
            <th>描述</th>
            <th>严重度</th>
            <th>责任部门</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  <strong>暂无试制问题</strong>
                  <p>可在当前试制记录下继续补充问题项。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.issueType}</td>
                <td>{item.description}</td>
                <td>{getTrialProductionIssueSeverityLabel(item.severity)}</td>
                <td>{item.responsibleDept}</td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PlanStatusBadge({
  status,
}: {
  status: FirstProductionPlanStatus;
}) {
  const className =
    status === 'COMPLETED'
      ? 'status-pill status-pill-success'
      : status === 'PLANNED'
        ? 'status-pill status-pill-warning'
        : status === 'CANCELLED'
          ? 'status-pill status-pill-danger'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getFirstProductionPlanStatusLabel(status)}</span>;
}

export function TrialStatusBadge({
  status,
}: {
  status: TrialProductionStatus;
}) {
  const className =
    status === 'PASSED'
      ? 'status-pill status-pill-success'
      : status === 'FAILED'
        ? 'status-pill status-pill-danger'
        : status === 'IN_PROGRESS'
          ? 'status-pill status-pill-warning'
          : 'status-pill status-pill-neutral';

  return <span className={className}>{getTrialProductionStatusLabel(status)}</span>;
}

export function ConfirmFirstPlanButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button button-secondary button-small" disabled={disabled} onClick={onClick}>
      确认计划
    </button>
  );
}

export function CompleteFirstPlanTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成首台计划节点
    </button>
  );
}

export function CompleteTrialProductionTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button button-secondary" disabled={disabled} onClick={onClick}>
      完成样车试制节点
    </button>
  );
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}
