'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';
import {
  approveCabinReview,
  canManageCabinReviews,
  canShowCabinReviewApproveButton,
  canShowCabinReviewRejectButton,
  canShowCabinReviewSubmitButton,
  createCabinReview,
  fetchCabinReviewPageOptions,
  fetchCabinReviewWorkspace,
  getCabinReviewConclusionLabel,
  getCabinReviewWorkspaceHighlights,
  getDefaultCabinReviewerId,
  rejectCabinReview,
  submitCabinReview,
  toCabinReviewFormInput,
  updateCabinReview,
  uploadCabinReviewAttachment,
  validateCabinReviewForm,
  type CabinReviewFormInput,
  type CabinReviewRecord,
  type CabinReviewWorkspaceResponse,
} from '../lib/reviews-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';
import { getWorkflowTaskStatusLabel, isWorkflowTaskOverdue } from '../lib/workflows-client';

type CabinReviewWorkspaceProps = {
  projectId: string;
};

const EMPTY_FORM: CabinReviewFormInput = {
  reviewDate: '',
  reviewerId: '',
  reviewConclusion: 'APPROVED',
  comment: '',
  conditionNote: '',
  rejectReason: '',
};

export function CabinReviewWorkspace({
  projectId,
}: CabinReviewWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<CabinReviewWorkspaceResponse | null>(null);
  const [reviewerOptions, setReviewerOptions] = useState<DirectoryUser[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState<CabinReviewFormInput>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace({ initial: true });
  }, [projectId]);

  useEffect(() => {
    if (!workspace?.items.length) {
      setSelectedReviewId(null);
      return;
    }

    const nextReviewId =
      selectedReviewId && workspace.items.some((item) => item.id === selectedReviewId)
        ? selectedReviewId
        : (workspace.items[0]?.id ?? null);

    if (nextReviewId !== selectedReviewId) {
      setSelectedReviewId(nextReviewId);
    }
  }, [selectedReviewId, workspace]);

  const canManage = canManageCabinReviews(user);
  const highlights = workspace ? getCabinReviewWorkspaceHighlights(workspace) : null;
  const selectedReview =
    workspace?.items.find((item) => item.id === selectedReviewId) ?? null;
  const isReadOnly = !workspace?.activeTask;
  const decisionGuidance =
    form.reviewConclusion === 'REJECTED'
      ? '驳回时必须填写驳回原因，并在评审意见中明确整改要求与整改责任人。'
      : form.reviewConclusion === 'CONDITIONAL_APPROVED'
        ? '条件通过时必须补充整改条件，后续整改要求也应写入评审意见。'
        : '通过时建议在评审意见中保留关键结论，附件可补充佐证材料。';

  const summaryCards = useMemo(
    () => [
      {
        label: '驾驶室评审任务',
        value: highlights?.activeTaskStatusLabel ?? '当前无驾驶室评审任务',
      },
      {
        label: '试制完成状态',
        value: workspace?.trialProductionCompleted ? '已完成' : '未完成',
      },
      {
        label: '颜色开发收费',
        value: highlights?.developmentFeeStatusLabel ?? '未激活',
      },
      {
        label: '一致性评审',
        value: highlights?.consistencyReviewStatusLabel ?? '未激活',
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
      const [workspaceResponse, users] = await Promise.all([
        fetchCabinReviewWorkspace(projectId),
        fetchCabinReviewPageOptions(),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(workspaceResponse);
      setReviewerOptions(users);
      setForm((current) => ({
        ...current,
        reviewerId:
          current.reviewerId && users.some((item) => item.id === current.reviewerId)
            ? current.reviewerId
            : getDefaultCabinReviewerId(users, user?.id ?? null),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '驾驶室评审工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    const validationMessage = validateCabinReviewForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingReviewId
        ? await updateCabinReview(projectId, editingReviewId, form)
        : await createCabinReview(projectId, form);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultCabinReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(editingReviewId ? '驾驶室评审记录已更新。' : '驾驶室评审记录已创建。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '驾驶室评审记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReviewAction(
    action: 'SUBMIT' | 'APPROVE' | 'REJECT',
    review: CabinReviewRecord,
  ) {
    setActingKey(`${action.toLowerCase()}:${review.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'SUBMIT'
          ? await submitCabinReview(projectId, review.id)
          : action === 'APPROVE'
            ? await approveCabinReview(projectId, review.id)
            : await rejectCabinReview(projectId, review.id);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultCabinReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(
        action === 'SUBMIT'
          ? '驾驶室评审记录已提交。'
          : action === 'APPROVE'
            ? '驾驶室评审已通过，后续并行节点已激活。'
            : '驾驶室评审已驳回，流程已退回样车试制。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '驾驶室评审动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleUploadAttachment(review: CabinReviewRecord, file: File) {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await uploadCabinReviewAttachment(projectId, review.id, file);
      setWorkspace(nextWorkspace);
      setSuccessMessage(`评审记录 ${review.id} 已上传附件。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '评审附件上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  function resetForm() {
    setEditingReviewId(null);
    setForm({
      ...EMPTY_FORM,
      reviewerId: getDefaultCabinReviewerId(reviewerOptions, user?.id ?? null),
    });
  }

  function prepareEdit(review: CabinReviewRecord) {
    if (review.submittedAt) {
      return;
    }

    setSelectedReviewId(review.id);
    setEditingReviewId(review.id);
    setForm(toCabinReviewFormInput(review));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Cabin Review</p>
        <h1>正在加载驾驶室评审模块…</h1>
        <p>评审记录、附件和流程状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Cabin Review</p>
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
            <Link href={`/projects/${projectId}/pilot-production`} className="button button-secondary">
              查看样车试制
            </Link>
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
            <span>节点负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>活跃任务状态</span>
            <strong>{highlights.activeTaskStatusLabel}</strong>
          </div>
          <div className="metadata-item">
            <span>最近试制样车</span>
            <strong>{workspace.latestTrialProduction?.vehicleNo ?? '未找到'}</strong>
          </div>
          <div className="metadata-item">
            <span>最近试制完成</span>
            <strong>{formatDate(workspace.latestTrialProduction?.completedAt)}</strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前驾驶室评审任务已超期。</p>
        ) : null}
        {!workspace.trialProductionCompleted ? (
          <p className="muted">样车试制完成后才会激活驾驶室评审任务。</p>
        ) : null}
        {selectedReview?.returnToNodeCode ? (
          <FeedbackBanner
            variant="warning"
            compact
            title="已触发退回"
            message={`当前选中记录已退回到 ${
              selectedReview.returnToNodeName ?? selectedReview.returnToNodeCode
            }，下一轮样车试制已重新进入主线。`}
          />
        ) : null}
      </section>

      {error ? <FeedbackBanner variant="error" title="评审操作失败" message={error} /> : null}
      {successMessage ? (
        <FeedbackBanner variant="success" title="评审操作已完成" message={successMessage} />
      ) : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review Form</p>
            <h2 className="section-title">驾驶室评审表单</h2>
            <p className="muted">支持草稿编辑、提交审批和附件上传。条件通过与驳回原因必须保留。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <div className="review-form-shell">
          <FeedbackBanner
            variant={form.reviewConclusion === 'REJECTED' ? 'warning' : 'info'}
            compact
            title="表单门禁"
            message={decisionGuidance}
          />
          <CabinReviewForm
            value={form}
            reviewerOptions={reviewerOptions}
            disabled={!canManage || isReadOnly || isSaving}
            submitLabel={editingReviewId ? '更新评审记录' : '新建评审记录'}
            onChange={setForm}
            onSubmit={() => void handleSave()}
          />
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review History</p>
            <h2 className="section-title">驾驶室评审历史</h2>
            <p className="muted">查看草稿、提交、通过、驳回记录，以及退回试制后的历史轨迹。</p>
          </div>
        </div>
        <CabinReviewHistory
          user={user}
          items={workspace.items}
          selectedReviewId={selectedReviewId}
          canManage={canManage}
          isReadOnly={isReadOnly}
          workspace={workspace}
          actingKey={actingKey}
          isUploading={isUploading}
          onSelect={setSelectedReviewId}
          onEdit={prepareEdit}
          onSubmitReview={(review) => void handleReviewAction('SUBMIT', review)}
          onApproveReview={(review) => void handleReviewAction('APPROVE', review)}
          onRejectReview={(review) => void handleReviewAction('REJECT', review)}
          onUploadAttachment={(review, file) => {
            void handleUploadAttachment(review, file);
          }}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review Detail</p>
            <h2 className="section-title">驾驶室评审详情</h2>
            <p className="muted">展示评审意见、附件和并行后续节点状态。</p>
          </div>
          {selectedReview ? (
            <div className="inline-actions">
              <Link
                href={`/projects/${projectId}/attachments?entityType=REVIEW_RECORD&entityId=${selectedReview.id}`}
                className="button button-secondary"
              >
                查看附件中心
              </Link>
            </div>
          ) : null}
        </div>
        <CabinReviewDetail
          review={selectedReview}
          developmentFeeTask={workspace.downstreamTasks.developmentFee}
          consistencyReviewTask={workspace.downstreamTasks.consistencyReview}
        />
      </section>
    </div>
  );
}

export function CabinReviewForm({
  value,
  reviewerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: CabinReviewFormInput;
  reviewerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: CabinReviewFormInput) => void;
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
        <div className="review-decision-grid" aria-label="评审结论提示">
          <div
            className={`review-decision-card${
              value.reviewConclusion === 'APPROVED' ? ' review-decision-card-active' : ''
            }`}
          >
            <strong>通过</strong>
            <p>直接进入并行收费与后续一致性评审。</p>
          </div>
          <div
            className={`review-decision-card${
              value.reviewConclusion === 'CONDITIONAL_APPROVED'
                ? ' review-decision-card-active'
                : ''
            }`}
          >
            <strong>条件通过</strong>
            <p>必须明确整改条件，后续跟踪要求仍需留痕。</p>
          </div>
          <div
            className={`review-decision-card${
              value.reviewConclusion === 'REJECTED' ? ' review-decision-card-active' : ''
            }`}
          >
            <strong>驳回</strong>
            <p>必须填写驳回原因，并在评审意见中注明整改责任人。</p>
          </div>
        </div>
      </div>
      <label className="field">
        <span>评审日期</span>
        <input
          data-testid="cabin-review-date-input"
          required
          type="date"
          disabled={disabled}
          value={value.reviewDate}
          onChange={(event) => onChange({ ...value, reviewDate: event.target.value })}
        />
      </label>
      <label className="field">
        <span>评审人</span>
        <select
          data-testid="cabin-review-reviewer-select"
          disabled={disabled}
          value={value.reviewerId}
          onChange={(event) => onChange({ ...value, reviewerId: event.target.value })}
        >
          <option value="">请选择评审人</option>
          {reviewerOptions.map((reviewer) => (
            <option key={reviewer.id} value={reviewer.id}>
              {reviewer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>评审结论</span>
        <select
          data-testid="cabin-review-conclusion-select"
          disabled={disabled}
          value={value.reviewConclusion}
          onChange={(event) =>
            onChange({
              ...value,
              reviewConclusion: event.target.value as CabinReviewFormInput['reviewConclusion'],
            })
          }
        >
          <option value="APPROVED">通过</option>
          <option value="CONDITIONAL_APPROVED">条件通过</option>
          <option value="REJECTED">驳回</option>
        </select>
      </label>
      <label className="field field-full">
        <span>评审意见</span>
        <textarea
          data-testid="cabin-review-comment-input"
          rows={4}
          disabled={disabled}
          value={value.comment}
          onChange={(event) => onChange({ ...value, comment: event.target.value })}
        />
        <small className="field-hint">
          驳回或条件通过时，请在这里补充整改要求、责任人和补充材料说明。
        </small>
      </label>
      <label className="field field-full">
        <span>条件通过说明</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.conditionNote}
          onChange={(event) => onChange({ ...value, conditionNote: event.target.value })}
        />
        <small className="field-hint">选择“条件通过”时，此字段为必填。</small>
      </label>
      <label className="field field-full">
        <span>驳回原因</span>
        <textarea
          data-testid="cabin-review-reject-reason-input"
          rows={3}
          disabled={disabled}
          value={value.rejectReason}
          onChange={(event) => onChange({ ...value, rejectReason: event.target.value })}
        />
        <small className="field-hint field-hint-emphasis">
          选择“驳回”时，此字段为必填，并会触发退回第 11 步生成新轮次。
        </small>
      </label>
      <div className="field field-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={disabled}
          data-testid="cabin-review-save-button"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function CabinReviewHistory({
  user,
  items,
  selectedReviewId,
  canManage,
  isReadOnly,
  workspace,
  actingKey,
  isUploading,
  onSelect,
  onEdit,
  onSubmitReview,
  onApproveReview,
  onRejectReview,
  onUploadAttachment,
}: {
  user: ReturnType<typeof useAuth>['user'];
  items: CabinReviewRecord[];
  selectedReviewId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  workspace: CabinReviewWorkspaceResponse;
  actingKey: string | null;
  isUploading: boolean;
  onSelect: (reviewId: string) => void;
  onEdit: (review: CabinReviewRecord) => void;
  onSubmitReview: (review: CabinReviewRecord) => void;
  onApproveReview: (review: CabinReviewRecord) => void;
  onRejectReview: (review: CabinReviewRecord) => void;
  onUploadAttachment: (review: CabinReviewRecord, file: File) => void;
}) {
  return (
    <div className="page-stack compact">
      <div className="table-shell table-shell-scroll" data-testid="cabin-review-history-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>评审日期</th>
              <th>评审人</th>
              <th>结论</th>
              <th>状态</th>
              <th>附件</th>
              <th>退回节点</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <StatePanel
                    compact
                    title="暂无驾驶室评审记录"
                    description="样车试制完成并激活评审任务后，可在这里创建评审记录。"
                  />
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={selectedReviewId === item.id ? 'row-selected' : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <td>{formatDate(item.reviewDate)}</td>
                  <td>{item.reviewerName ?? '未指定'}</td>
                  <td>
                    <ReviewConclusionBadge conclusion={item.reviewConclusion} />
                  </td>
                  <td>{item.submittedAt ? '已提交' : '草稿'}</td>
                  <td>{item.attachment ? item.attachment.fileName : '未上传'}</td>
                  <td>{item.returnToNodeName ?? '未退回'}</td>
                  <td>
                    <div className="task-actions">
                      {canManage && !isReadOnly && !item.submittedAt ? (
                        <>
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEdit(item);
                            }}
                          >
                            编辑
                          </button>
                          <label className="button button-secondary button-small upload-button">
                            {isUploading ? '上传中…' : '上传附件'}
                            <input
                              type="file"
                              disabled={isUploading}
                              onChange={(event) => {
                                const file = event.target.files?.[0];

                                if (file) {
                                  event.stopPropagation();
                                  onUploadAttachment(item, file);
                                }

                                event.target.value = '';
                              }}
                            />
                          </label>
                        </>
                      ) : null}
                      {canShowCabinReviewSubmitButton(user, workspace, item) ? (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={actingKey === `submit:${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSubmitReview(item);
                          }}
                        >
                          {actingKey === `submit:${item.id}` ? '处理中…' : '提交'}
                        </button>
                      ) : null}
                      {canShowCabinReviewApproveButton(user, workspace, item) ? (
                        <button
                          type="button"
                          className="button button-primary button-small"
                          disabled={actingKey === `approve:${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onApproveReview(item);
                          }}
                        >
                          {actingKey === `approve:${item.id}` ? '处理中…' : '通过'}
                        </button>
                      ) : null}
                      {canShowCabinReviewRejectButton(user, workspace, item) ? (
                        <button
                          type="button"
                          className="button button-danger button-small"
                          disabled={actingKey === `reject:${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRejectReview(item);
                          }}
                        >
                          {actingKey === `reject:${item.id}` ? '处理中…' : '驳回'}
                        </button>
                      ) : null}
                      {(!canManage || isReadOnly) && !item.submittedAt ? (
                        <span className="muted">只读</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {items.length > 0 ? (
        <div className="timeline-list">
          {items.map((item) => (
            <article
              key={`${item.id}-timeline`}
              className={`timeline-card${selectedReviewId === item.id ? ' timeline-card-selected' : ''}`}
            >
              <div className="timeline-header">
                <strong>{formatDate(item.reviewDate)}</strong>
                <ReviewConclusionBadge conclusion={item.reviewConclusion} />
              </div>
              <p className="muted">
                {item.reviewerName ?? '未指定评审人'} / {item.submittedAt ? '已提交审批' : '草稿待补充'}
                {item.returnToNodeName ? ` / 退回到 ${item.returnToNodeName}` : ''}
              </p>
              <p className="timeline-comment">
                {item.rejectReason ?? item.conditionNote ?? item.comment ?? '当前记录暂无补充说明。'}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CabinReviewDetail({
  review,
  developmentFeeTask,
  consistencyReviewTask,
}: {
  review: CabinReviewRecord | null;
  developmentFeeTask: CabinReviewWorkspaceResponse['downstreamTasks']['developmentFee'];
  consistencyReviewTask: CabinReviewWorkspaceResponse['downstreamTasks']['consistencyReview'];
}) {
  if (!review) {
    return (
      <StatePanel
        title="请选择一条驾驶室评审记录"
        description="这里会展示评审意见、附件和后续并行节点状态。"
      />
    );
  }

  return (
    <div className="page-stack">
      <div className="detail-grid">
        <div className="detail-item">
          <span>评审人</span>
          <strong>{review.reviewerName ?? '未指定'}</strong>
        </div>
        <div className="detail-item">
          <span>评审日期</span>
          <strong>{formatDate(review.reviewDate)}</strong>
        </div>
        <div className="detail-item">
          <span>评审结论</span>
          <strong>{getCabinReviewConclusionLabel(review.reviewConclusion)}</strong>
        </div>
        <div className="detail-item">
          <span>提交流程</span>
          <strong>{review.submittedAt ? '已提交' : '草稿'}</strong>
        </div>
        <div className="detail-item detail-item-full">
          <span>评审意见</span>
          <strong>{review.comment ?? '未填写'}</strong>
        </div>
        <div className="detail-item detail-item-full">
          <span>条件通过说明</span>
          <strong>{review.conditionNote ?? '无'}</strong>
        </div>
        <div className="detail-item detail-item-full">
          <span>驳回原因</span>
          <strong>{review.rejectReason ?? '无'}</strong>
        </div>
        <div className="detail-item">
          <span>退回节点</span>
          <strong>{review.returnToNodeName ?? '未退回'}</strong>
        </div>
        <div className="detail-item">
          <span>样车编号</span>
          <strong>{review.trialProduction?.vehicleNo ?? '未关联'}</strong>
        </div>
        <div className="detail-item">
          <span>收费节点</span>
          <strong>
            {developmentFeeTask
              ? getWorkflowTaskStatusLabel(developmentFeeTask.status)
              : '未激活'}
          </strong>
        </div>
        <div className="detail-item">
          <span>一致性评审</span>
          <strong>
            {consistencyReviewTask
              ? getWorkflowTaskStatusLabel(consistencyReviewTask.status)
              : '未激活'}
          </strong>
        </div>
      </div>
      <CabinReviewAttachmentList attachment={review.attachment} history={review.attachmentHistory} />
    </div>
  );
}

export function CabinReviewAttachmentList({
  attachment,
  history,
}: {
  attachment: CabinReviewRecord['attachment'];
  history: CabinReviewRecord['attachmentHistory'];
}) {
  return (
    <div className="page-stack">
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>当前附件</span>
          <strong>
            {attachment ? (
              <a href={attachment.contentUrl} target="_blank" rel="noreferrer">
                {attachment.fileName}
              </a>
            ) : (
              '未上传'
            )}
          </strong>
        </div>
      </div>
      {history.length > 0 ? (
        <div className="detail-grid">
          {history.map((item) => (
            <div key={item.id} className="detail-item">
              <span>{formatDate(item.createdAt)}</span>
              <strong>
                <a href={item.contentUrl} target="_blank" rel="noreferrer">
                  {item.fileName}
                </a>
              </strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReviewConclusionBadge({
  conclusion,
}: {
  conclusion: CabinReviewRecord['reviewConclusion'];
}) {
  const className =
    conclusion === 'APPROVED'
      ? 'status-pill status-pill-success'
      : conclusion === 'CONDITIONAL_APPROVED'
        ? 'status-pill status-pill-warning'
        : 'status-pill status-pill-danger';

  return <span className={className}>{getCabinReviewConclusionLabel(conclusion)}</span>;
}
