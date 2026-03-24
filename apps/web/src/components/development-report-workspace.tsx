'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DevelopmentReportDetail } from './development-report-detail';
import {
  fetchDevelopmentReportWorkspace,
  saveDevelopmentReport,
  submitDevelopmentReport,
  type DevelopmentReportWorkspaceResponse,
  type DevelopmentReportWritePayload,
} from '../lib/development-reports-client';
import {
  formatDate,
  getWorkflowNodeLabel,
  toDateInputValue,
} from '../lib/projects-client';
import {
  getWorkflowTaskStatusLabel,
  isWorkflowTaskOverdue,
} from '../lib/workflows-client';

type DevelopmentReportWorkspaceProps = {
  projectId: string;
};

type FormState = {
  reportTitle: string;
  demandSource: string;
  targetMarket: string;
  targetVehicleModel: string;
  targetColorName: string;
  benchmarkColorRef: string;
  developmentReason: string;
  expectedLaunchDate: string;
  estimatedAnnualVolume: string;
  technicalRequirements: string;
  qualityRequirements: string;
  costTarget: string;
  riskSummary: string;
  remark: string;
  submitComment: string;
};

const EMPTY_FORM_STATE: FormState = {
  reportTitle: '',
  demandSource: '',
  targetMarket: '',
  targetVehicleModel: '',
  targetColorName: '',
  benchmarkColorRef: '',
  developmentReason: '',
  expectedLaunchDate: '',
  estimatedAnnualVolume: '',
  technicalRequirements: '',
  qualityRequirements: '',
  costTarget: '',
  riskSummary: '',
  remark: '',
  submitComment: '',
};

export function DevelopmentReportWorkspace({
  projectId,
}: DevelopmentReportWorkspaceProps) {
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] =
    useState<DevelopmentReportWorkspaceResponse | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  const reportForDisplay = useMemo(
    () => workspace?.currentReport ?? workspace?.latestReport ?? null,
    [workspace],
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
      const response = await fetchDevelopmentReportWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
      setFormState(buildFormState(response));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '开发报告加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await saveDevelopmentReport(projectId, toWritePayload(formState));
      setWorkspace(nextWorkspace);
      setFormState(buildFormState(nextWorkspace));
      setSuccessMessage('开发报告草稿已保存。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '开发报告保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await submitDevelopmentReport(
        projectId,
        toWritePayload(formState),
      );
      setWorkspace(nextWorkspace);
      setFormState(buildFormState(nextWorkspace));
      setSuccessMessage('开发报告已提交，流程已推进到下一个节点。');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '开发报告提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !workspace) {
    return (
      <section className="page-card">
        <p className="eyebrow">Development Report</p>
        <h1>正在加载开发报告…</h1>
        <p>表单、流程节点和最近一次提交记录正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Development Report</p>
            <h2 className="section-title">{workspace.project.name}</h2>
            <p className="muted">
              当前节点 {workspace.project.currentNodeName ?? '未开始'}，目标日期{' '}
              {formatDate(workspace.project.targetDate)}。
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
            <Link
              href={`/projects/${projectId}/workflow`}
              className="button button-secondary"
            >
              查看流程
            </Link>
          </div>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span>当前项目节点</span>
            <strong>{getWorkflowNodeLabel(workspace.project.currentNodeCode)}</strong>
          </div>
          <div className="metadata-item">
            <span>报告节点状态</span>
            <strong>
              {workspace.activeTask
                ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
                : '当前无活跃任务'}
            </strong>
          </div>
          <div className="metadata-item">
            <span>节点负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>计划时间</span>
            <strong>{formatDate(workspace.activeTask?.dueAt ?? null)}</strong>
          </div>
        </div>

        {workspace.activeTask && isWorkflowTaskOverdue({
          ...workspace.activeTask,
          isActive: true,
          isPrimary: true,
          taskRound: 1,
          completedAt: null,
          payload: null,
          createdAt: workspace.activeTask.startedAt ?? new Date().toISOString(),
          updatedAt: workspace.activeTask.returnedAt ?? new Date().toISOString(),
        }) ? <p className="error-text">当前开发报告节点已超期，请尽快处理。</p> : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Report Form</p>
            <h2 className="section-title">新颜色开发报告表单</h2>
            <p className="muted">
              保存仅落草稿。提交会绑定当前开发报告节点并推动工作流进入涂料开发。
            </p>
          </div>
        </div>

        {!workspace.editable ? (
          <div className="empty-state">
            <strong>当前报告节点不可编辑</strong>
            <p>
              当前项目没有活跃的开发报告任务，或者当前登录用户不是节点负责人。仍可在下方查看最近一次报告详情。
            </p>
          </div>
        ) : (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <label className="field">
              <span>报告标题</span>
              <input
                value={formState.reportTitle}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    reportTitle: event.target.value,
                  }))
                }
                placeholder="默认按项目名称生成"
              />
            </label>
            <label className="field">
              <span>需求来源</span>
              <input
                required
                value={formState.demandSource}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    demandSource: event.target.value,
                  }))
                }
                placeholder="例如：市场反馈、客户定制、年度规划"
              />
            </label>
            <label className="field">
              <span>目标市场</span>
              <input
                value={formState.targetMarket}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetMarket: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>目标车型</span>
              <input
                value={formState.targetVehicleModel}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetVehicleModel: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>目标颜色</span>
              <input
                required
                value={formState.targetColorName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetColorName: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>对标颜色</span>
              <input
                value={formState.benchmarkColorRef}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    benchmarkColorRef: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>预计上市时间</span>
              <input
                type="date"
                value={formState.expectedLaunchDate}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    expectedLaunchDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>预计年需求（台）</span>
              <input
                type="number"
                min="0"
                value={formState.estimatedAnnualVolume}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    estimatedAnnualVolume: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>开发原因</span>
              <textarea
                required
                rows={4}
                value={formState.developmentReason}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    developmentReason: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>技术要求</span>
              <textarea
                rows={4}
                value={formState.technicalRequirements}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    technicalRequirements: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>质量要求</span>
              <textarea
                rows={4}
                value={formState.qualityRequirements}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    qualityRequirements: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>成本目标</span>
              <input
                value={formState.costTarget}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    costTarget: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>风险提示</span>
              <textarea
                rows={3}
                value={formState.riskSummary}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    riskSummary: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>备注</span>
              <textarea
                rows={3}
                value={formState.remark}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    remark: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>提交说明</span>
              <textarea
                rows={2}
                value={formState.submitComment}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    submitComment: event.target.value,
                  }))
                }
                placeholder="可选，提交时写入流程流转说明。"
              />
            </label>

            <div className="inline-actions field-full">
              <button
                type="submit"
                className="button button-secondary"
                disabled={isSaving || isSubmitting}
              >
                {isSaving ? '保存中…' : '保存草稿'}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!workspace.submitAllowed || isSaving || isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? '提交中…' : '保存并提交'}
              </button>
            </div>
          </form>
        )}
      </section>

      <DevelopmentReportDetail
        report={reportForDisplay}
        activeTask={workspace.activeTask}
      />
    </div>
  );
}

function buildFormState(workspace: DevelopmentReportWorkspaceResponse): FormState {
  const source = workspace.currentReport ?? workspace.latestReport;

  return {
    reportTitle: source?.reportTitle ?? `${workspace.project.name} 新颜色开发报告`,
    demandSource: source?.demandSource ?? '',
    targetMarket: source?.targetMarket ?? '',
    targetVehicleModel: source?.targetVehicleModel ?? '',
    targetColorName: source?.targetColorName ?? '',
    benchmarkColorRef: source?.benchmarkColorRef ?? '',
    developmentReason: source?.developmentReason ?? '',
    expectedLaunchDate: toDateInputValue(source?.expectedLaunchDate ?? null),
    estimatedAnnualVolume:
      source?.estimatedAnnualVolume === null || source?.estimatedAnnualVolume === undefined
        ? ''
        : String(source.estimatedAnnualVolume),
    technicalRequirements: source?.technicalRequirements ?? '',
    qualityRequirements: source?.qualityRequirements ?? '',
    costTarget: source?.costTarget ?? '',
    riskSummary: source?.riskSummary ?? '',
    remark: source?.remark ?? '',
    submitComment: '',
  };
}

function toWritePayload(formState: FormState): DevelopmentReportWritePayload {
  return {
    demandSource: formState.demandSource,
    targetMarket: formState.targetMarket || null,
    targetVehicleModel: formState.targetVehicleModel || null,
    targetColorName: formState.targetColorName,
    benchmarkColorRef: formState.benchmarkColorRef || null,
    developmentReason: formState.developmentReason,
    expectedLaunchDate: formState.expectedLaunchDate || null,
    estimatedAnnualVolume: formState.estimatedAnnualVolume
      ? Number(formState.estimatedAnnualVolume)
      : null,
    technicalRequirements: formState.technicalRequirements || null,
    qualityRequirements: formState.qualityRequirements || null,
    costTarget: formState.costTarget || null,
    riskSummary: formState.riskSummary || null,
    remark: formState.remark || null,
    submitComment: formState.submitComment || null,
    ...(formState.reportTitle ? { reportTitle: formState.reportTitle } : {}),
  };
}
