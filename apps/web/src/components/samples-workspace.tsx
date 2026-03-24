'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  formatDate,
  getWorkflowNodeLabel,
  toDateInputValue,
} from '../lib/projects-client';
import {
  SAMPLE_TYPE_OPTIONS,
  createSample,
  fetchSamplesWorkspace,
  getSampleConfirmationDecisionLabel,
  getSampleStatusLabel,
  getSampleTypeLabel,
  submitSampleConfirmation,
  type SampleConfirmationDecision,
  type SampleListItem,
  type SamplesWorkspaceResponse,
} from '../lib/samples-client';
import {
  canUserOperateWorkflowTask,
  getWorkflowTaskStatusLabel,
  isWorkflowTaskOverdue,
} from '../lib/workflows-client';

type SamplesWorkspaceProps = {
  projectId: string;
};

type SampleFormState = {
  sampleNo: string;
  sampleName: string;
  sampleType: (typeof SAMPLE_TYPE_OPTIONS)[number]['value'];
  location: string;
  remark: string;
  producedAt: string;
  createNewVersion: boolean;
};

type ConfirmationFormState = {
  sampleId: string;
  colorAssessment: string;
  appearanceAssessment: string;
  comment: string;
};

const EMPTY_SAMPLE_FORM: SampleFormState = {
  sampleNo: '',
  sampleName: '',
  sampleType: 'PANEL',
  location: '',
  remark: '',
  producedAt: '',
  createNewVersion: false,
};

const EMPTY_CONFIRMATION_FORM: ConfirmationFormState = {
  sampleId: '',
  colorAssessment: '',
  appearanceAssessment: '',
  comment: '',
};

export function SamplesWorkspace({ projectId }: SamplesWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<SamplesWorkspaceResponse | null>(null);
  const [sampleForm, setSampleForm] = useState<SampleFormState>(EMPTY_SAMPLE_FORM);
  const [confirmationForm, setConfirmationForm] =
    useState<ConfirmationFormState>(EMPTY_CONFIRMATION_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSample, setIsSavingSample] = useState(false);
  const [isSubmittingConfirmation, setIsSubmittingConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  async function loadWorkspace(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchSamplesWorkspace(projectId);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(response);
      setConfirmationForm((current) => ({
        ...current,
        sampleId:
          current.sampleId && response.items.some((item) => item.id === current.sampleId)
            ? current.sampleId
            : (response.items[0]?.id ?? ''),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '样板工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleCreateSample() {
    setIsSavingSample(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createSample(projectId, {
        sampleNo: sampleForm.sampleNo,
        sampleName: sampleForm.sampleName,
        sampleType: sampleForm.sampleType,
        location: sampleForm.location || null,
        remark: sampleForm.remark || null,
        producedAt: sampleForm.producedAt || null,
        createNewVersion: sampleForm.createNewVersion,
      });
      setSuccessMessage(
        sampleForm.createNewVersion ? '样板新版本已创建。' : '样板记录已创建。',
      );
      setSampleForm(EMPTY_SAMPLE_FORM);
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '样板记录保存失败。');
    } finally {
      setIsSavingSample(false);
    }
  }

  async function handleSubmitConfirmation(decision: SampleConfirmationDecision) {
    setIsSubmittingConfirmation(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await submitSampleConfirmation(projectId, {
        sampleId: confirmationForm.sampleId,
        decision,
        colorAssessment: confirmationForm.colorAssessment || null,
        appearanceAssessment: confirmationForm.appearanceAssessment || null,
        comment: confirmationForm.comment || null,
      });
      setWorkspace(nextWorkspace);
      setConfirmationForm({
        ...EMPTY_CONFIRMATION_FORM,
        sampleId: nextWorkspace.items[0]?.id ?? '',
      });
      setSuccessMessage(`样板颜色确认已${getSampleConfirmationDecisionLabel(decision)}。`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '样板颜色确认提交失败。',
      );
    } finally {
      setIsSubmittingConfirmation(false);
    }
  }

  function prepareNewVersion(item: SampleListItem) {
    setSampleForm({
      sampleNo: item.sampleNo,
      sampleName: item.sampleName,
      sampleType: item.sampleType,
      location: item.location ?? '',
      remark: item.remark ?? '',
      producedAt: toDateInputValue(item.producedAt),
      createNewVersion: true,
    });
  }

  function resetSampleForm() {
    setSampleForm(EMPTY_SAMPLE_FORM);
  }

  if (isLoading || !workspace) {
    return (
      <section className="page-card">
        <p className="eyebrow">Samples</p>
        <h1>正在加载样板模块…</h1>
        <p>样板列表、确认节点和当前版本信息正在同步。</p>
      </section>
    );
  }

  const confirmationAllowed =
    workspace.activeConfirmationTask &&
    canUserOperateWorkflowTask(user, {
      ...workspace.activeConfirmationTask,
      taskRound: 1,
      isActive: true,
      isPrimary: true,
      completedAt: null,
      payload: null,
      createdAt: workspace.activeConfirmationTask.startedAt ?? new Date().toISOString(),
      updatedAt: workspace.activeConfirmationTask.returnedAt ?? new Date().toISOString(),
    });

  const confirmationActionSet = new Set(
    workspace.activeConfirmationTask?.availableActions ?? [],
  );

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Samples</p>
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
            <Link href={`/projects/${projectId}/workflow`} className="button button-secondary">
              查看流程
            </Link>
          </div>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span>项目当前节点</span>
            <strong>{getWorkflowNodeLabel(workspace.project.currentNodeCode)}</strong>
          </div>
          <div className="metadata-item">
            <span>确认节点状态</span>
            <strong>
              {workspace.activeConfirmationTask
                ? getWorkflowTaskStatusLabel(workspace.activeConfirmationTask.status)
                : '当前无确认任务'}
            </strong>
          </div>
          <div className="metadata-item">
            <span>节点负责人</span>
            <strong>{workspace.activeConfirmationTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>当前样板数</span>
            <strong>{workspace.items.length}</strong>
          </div>
        </div>

        {workspace.activeConfirmationTask &&
        isWorkflowTaskOverdue({
          ...workspace.activeConfirmationTask,
          taskRound: 1,
          isActive: true,
          isPrimary: true,
          completedAt: null,
          payload: null,
          createdAt: workspace.activeConfirmationTask.startedAt ?? new Date().toISOString(),
          updatedAt: workspace.activeConfirmationTask.returnedAt ?? new Date().toISOString(),
        }) ? <p className="error-text">当前样板颜色确认节点已超期。</p> : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sample Entry</p>
            <h2 className="section-title">样板录入与版本管理</h2>
            <p className="muted">同编号样板可新增版本，新版本会自动替换为当前版本。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetSampleForm}>
              重置表单
            </button>
          </div>
        </div>

        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateSample();
          }}
        >
          <label className="field">
            <span>样板编号</span>
            <input
              required
              value={sampleForm.sampleNo}
              onChange={(event) =>
                setSampleForm((current) => ({ ...current, sampleNo: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>样板名称</span>
            <input
              required
              value={sampleForm.sampleName}
              onChange={(event) =>
                setSampleForm((current) => ({ ...current, sampleName: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>样板类型</span>
            <select
              value={sampleForm.sampleType}
              onChange={(event) =>
                setSampleForm((current) => ({
                  ...current,
                  sampleType: event.target.value as SampleFormState['sampleType'],
                }))
              }
            >
              {SAMPLE_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>样板位置</span>
            <input
              value={sampleForm.location}
              onChange={(event) =>
                setSampleForm((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>出样时间</span>
            <input
              type="date"
              value={sampleForm.producedAt}
              onChange={(event) =>
                setSampleForm((current) => ({ ...current, producedAt: event.target.value }))
              }
            />
          </label>
          <label className="field field-checkbox">
            <span>创建新版本</span>
            <input
              type="checkbox"
              checked={sampleForm.createNewVersion}
              onChange={(event) =>
                setSampleForm((current) => ({
                  ...current,
                  createNewVersion: event.target.checked,
                }))
              }
            />
          </label>
          <label className="field field-full">
            <span>备注</span>
            <textarea
              rows={3}
              value={sampleForm.remark}
              onChange={(event) =>
                setSampleForm((current) => ({ ...current, remark: event.target.value }))
              }
            />
          </label>

          <div className="inline-actions field-full">
            <button
              type="submit"
              className="button button-primary"
              disabled={isSavingSample}
            >
              {isSavingSample ? '保存中…' : sampleForm.createNewVersion ? '创建新版本' : '保存样板'}
            </button>
          </div>
        </form>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sample Confirmation</p>
            <h2 className="section-title">样板确认表单</h2>
            <p className="muted">确认通过后由后端推进到“涂料采购”，并并行创建“新颜色取号”。</p>
          </div>
        </div>

        {!workspace.activeConfirmationTask ? (
          <div className="empty-state">
            <strong>当前没有活跃的样板颜色确认任务</strong>
            <p>可以先录入样板版本，待流程进入样板颜色确认节点后再提交确认结果。</p>
          </div>
        ) : !confirmationAllowed ? (
          <div className="empty-state">
            <strong>当前登录用户不能处理该确认任务</strong>
            <p>只有项目经理、管理员或当前节点负责人可以提交样板颜色确认。</p>
          </div>
        ) : (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitConfirmation('APPROVE');
            }}
          >
            <label className="field">
              <span>确认样板</span>
              <select
                value={confirmationForm.sampleId}
                onChange={(event) =>
                  setConfirmationForm((current) => ({
                    ...current,
                    sampleId: event.target.value,
                  }))
                }
              >
                <option value="">请选择样板</option>
                {workspace.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sampleNo} / {item.sampleName} / V{item.versionNo}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>颜色评价</span>
              <input
                value={confirmationForm.colorAssessment}
                onChange={(event) =>
                  setConfirmationForm((current) => ({
                    ...current,
                    colorAssessment: event.target.value,
                  }))
                }
                placeholder="例如：颜色饱和度、与目标色偏差"
              />
            </label>
            <label className="field field-full">
              <span>外观评价</span>
              <textarea
                rows={3}
                value={confirmationForm.appearanceAssessment}
                onChange={(event) =>
                  setConfirmationForm((current) => ({
                    ...current,
                    appearanceAssessment: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-full">
              <span>确认说明</span>
              <textarea
                rows={3}
                value={confirmationForm.comment}
                onChange={(event) =>
                  setConfirmationForm((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
              />
            </label>

            <div className="task-actions field-full">
              {confirmationActionSet.has('APPROVE') ? (
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={!confirmationForm.sampleId || isSubmittingConfirmation}
                >
                  {isSubmittingConfirmation ? '提交中…' : '确认通过'}
                </button>
              ) : null}
              {confirmationActionSet.has('REJECT') ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!confirmationForm.sampleId || isSubmittingConfirmation}
                  onClick={() => void handleSubmitConfirmation('REJECT')}
                >
                  驳回
                </button>
              ) : null}
              {confirmationActionSet.has('RETURN') ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!confirmationForm.sampleId || isSubmittingConfirmation}
                  onClick={() => void handleSubmitConfirmation('RETURN')}
                >
                  退回
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sample Records</p>
            <h2 className="section-title">样板记录列表</h2>
            <p className="muted">列表只展示当前版本，详情页可查看版本历史、图片和确认记录。</p>
          </div>
        </div>

        {workspace.items.length === 0 ? (
          <div className="empty-state">
            <strong>暂无样板记录</strong>
            <p>先在上方录入样板信息，后续再上传图片并发起样板颜色确认。</p>
          </div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>样板</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>出样时间</th>
                  <th>图片</th>
                  <th>版本</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {workspace.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="cell-stack">
                        <strong>{item.sampleName}</strong>
                        <span>
                          {item.sampleNo} / V{item.versionNo}
                        </span>
                        <span>{item.location ?? '未设置位置'}</span>
                      </div>
                    </td>
                    <td>{getSampleTypeLabel(item.sampleType)}</td>
                    <td>{getSampleStatusLabel(item.status)}</td>
                    <td>{formatDate(item.producedAt)}</td>
                    <td>{item.imageCount} 张</td>
                    <td>{item.versionCount} 个版本</td>
                    <td>
                      <div className="task-actions">
                        <Link
                          href={`/projects/${projectId}/samples/${item.id}`}
                          className="button button-secondary button-small"
                        >
                          查看详情
                        </Link>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          onClick={() => prepareNewVersion(item)}
                        >
                          新建版本
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
