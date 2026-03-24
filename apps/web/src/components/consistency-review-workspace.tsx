'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  approveConsistencyReview,
  canManageConsistencyReviews,
  canShowConsistencyReviewApproveButton,
  canShowConsistencyReviewRejectButton,
  canShowConsistencyReviewSubmitButton,
  createConsistencyReview,
  fetchConsistencyReviewPageOptions,
  fetchConsistencyReviewWorkspace,
  getConsistencyReviewConclusionLabel,
  getConsistencyReviewWorkspaceHighlights,
  getDefaultConsistencyReviewerId,
  rejectConsistencyReview,
  submitConsistencyReview,
  toConsistencyReviewFormInput,
  updateConsistencyReview,
  uploadConsistencyReviewAttachment,
  validateConsistencyReviewForm,
  type ConsistencyReviewFormInput,
  type ConsistencyReviewRecord,
  type ConsistencyReviewWorkspaceResponse,
} from '../lib/consistency-reviews-client';
import { type DirectoryUser, formatDate, getWorkflowNodeLabel } from '../lib/projects-client';
import { getWorkflowTaskStatusLabel, isWorkflowTaskOverdue } from '../lib/workflows-client';

type ConsistencyReviewWorkspaceProps = {
  projectId: string;
};

const EMPTY_FORM: ConsistencyReviewFormInput = {
  reviewDate: '',
  reviewerId: '',
  reviewConclusion: 'APPROVED',
  comment: '',
  conditionNote: '',
  rejectReason: '',
};

export function ConsistencyReviewWorkspace({
  projectId,
}: ConsistencyReviewWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<ConsistencyReviewWorkspaceResponse | null>(null);
  const [reviewerOptions, setReviewerOptions] = useState<DirectoryUser[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState<ConsistencyReviewFormInput>(EMPTY_FORM);
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

  const canManage = canManageConsistencyReviews(user);
  const highlights = workspace ? getConsistencyReviewWorkspaceHighlights(workspace) : null;
  const selectedReview =
    workspace?.items.find((item) => item.id === selectedReviewId) ?? null;
  const latestReview = workspace?.items[0] ?? null;
  const isReadOnly = !workspace?.activeTask;

  const summaryCards = useMemo(
    () => [
      {
        label: '一致性评审任务',
        value: highlights?.activeTaskStatusLabel ?? '当前无一致性评审任务',
      },
      {
        label: '驾驶室评审状态',
        value: workspace?.cabinReviewCompleted ? '已通过' : '未通过',
      },
      {
        label: '排产计划',
        value: highlights?.downstreamTaskStatusLabel ?? '未激活',
      },
      {
        label: '历史记录数',
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
      const [workspaceResponse, users] = await Promise.all([
        fetchConsistencyReviewWorkspace(projectId),
        fetchConsistencyReviewPageOptions(),
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
            : getDefaultConsistencyReviewerId(users, user?.id ?? null),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '一致性评审工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    const validationMessage = validateConsistencyReviewForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingReviewId
        ? await updateConsistencyReview(projectId, editingReviewId, form)
        : await createConsistencyReview(projectId, form);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultConsistencyReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(
        editingReviewId ? '一致性评审记录已更新。' : '一致性评审记录已创建。',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '一致性评审记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReviewAction(
    action: 'SUBMIT' | 'APPROVE' | 'REJECT',
    review: ConsistencyReviewRecord,
  ) {
    setActingKey(`${action.toLowerCase()}:${review.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'SUBMIT'
          ? await submitConsistencyReview(projectId, review.id)
          : action === 'APPROVE'
            ? await approveConsistencyReview(projectId, review.id)
            : await rejectConsistencyReview(projectId, review.id);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultConsistencyReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(
        action === 'SUBMIT'
          ? '一致性评审记录已提交。'
          : action === 'APPROVE'
            ? '一致性评审已通过，排产计划节点已可进入。'
            : '一致性评审已驳回，流程已退回涂料开发。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '一致性评审动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleUploadAttachment(review: ConsistencyReviewRecord, file: File) {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await uploadConsistencyReviewAttachment(projectId, review.id, file);
      setWorkspace(nextWorkspace);
      setSuccessMessage(`一致性评审记录 ${review.id} 已上传附件。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '一致性评审附件上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  function resetForm() {
    setEditingReviewId(null);
    setForm({
      ...EMPTY_FORM,
      reviewerId: getDefaultConsistencyReviewerId(reviewerOptions, user?.id ?? null),
    });
  }

  function prepareEdit(review: ConsistencyReviewRecord) {
    if (review.submittedAt) {
      return;
    }

    setSelectedReviewId(review.id);
    setEditingReviewId(review.id);
    setForm(toConsistencyReviewFormInput(review));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Consistency Review</p>
        <h1>正在加载一致性评审模块…</h1>
        <p>评审记录、附件和排产计划联动状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Consistency Review</p>
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
            <Link href={`/projects/${projectId}/production-plans`} className="button button-secondary">
              查看排产计划
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
            <span>最近评审结论</span>
            <strong>
              {latestReview
                ? getConsistencyReviewConclusionLabel(latestReview.reviewConclusion)
                : '暂无'}
            </strong>
          </div>
          <div className="metadata-item">
            <span>最近评审人</span>
            <strong>{latestReview?.reviewerName ?? '暂无'}</strong>
          </div>
          <div className="metadata-item">
            <span>退回目标节点</span>
            <strong>
              {latestReview?.returnToNodeCode
                ? getWorkflowNodeLabel(latestReview.returnToNodeCode)
                : '无'}
            </strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前颜色一致性评审任务已超期。</p>
        ) : null}
        {!workspace.cabinReviewCompleted ? (
          <p className="muted">样车驾驶室评审通过后才会激活颜色一致性评审任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review Form</p>
            <h2 className="section-title">颜色一致性评审表单</h2>
            <p className="muted">提交后由后端判定通过或驳回，并推进或退回流程。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <ConsistencyReviewForm
          value={form}
          reviewerOptions={reviewerOptions}
          disabled={!canManage || isReadOnly || isSaving}
          submitLabel={editingReviewId ? '更新评审记录' : '新建评审记录'}
          onChange={setForm}
          onSubmit={() => void handleSave()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review History</p>
            <h2 className="section-title">一致性评审历史</h2>
            <p className="muted">支持查看提交状态、条件通过说明、退回记录和附件。</p>
          </div>
        </div>
        <ConsistencyReviewHistory
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
            <h2 className="section-title">一致性评审详情</h2>
            <p className="muted">展示评审意见、附件历史、退回记录和排产计划状态。</p>
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
        <ConsistencyReviewDetail
          review={selectedReview}
          downstreamTask={workspace.downstreamTask}
        />
      </section>
    </div>
  );
}

export function ConsistencyReviewForm({
  value,
  reviewerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: ConsistencyReviewFormInput;
  reviewerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: ConsistencyReviewFormInput) => void;
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
        <span>评审日期</span>
        <input
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
          disabled={disabled}
          value={value.reviewConclusion}
          onChange={(event) =>
            onChange({
              ...value,
              reviewConclusion: event.target.value as ConsistencyReviewFormInput['reviewConclusion'],
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
          rows={4}
          disabled={disabled}
          value={value.comment}
          onChange={(event) => onChange({ ...value, comment: event.target.value })}
        />
      </label>
      <label className="field field-full">
        <span>条件通过说明</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.conditionNote}
          onChange={(event) => onChange({ ...value, conditionNote: event.target.value })}
        />
      </label>
      <label className="field field-full">
        <span>驳回原因</span>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.rejectReason}
          onChange={(event) => onChange({ ...value, rejectReason: event.target.value })}
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

export function ConsistencyReviewHistory({
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
  items: ConsistencyReviewRecord[];
  selectedReviewId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  workspace: ConsistencyReviewWorkspaceResponse;
  actingKey: string | null;
  isUploading: boolean;
  onSelect: (reviewId: string) => void;
  onEdit: (review: ConsistencyReviewRecord) => void;
  onSubmitReview: (review: ConsistencyReviewRecord) => void;
  onApproveReview: (review: ConsistencyReviewRecord) => void;
  onRejectReview: (review: ConsistencyReviewRecord) => void;
  onUploadAttachment: (review: ConsistencyReviewRecord, file: File) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>评审日期</th>
            <th>评审人</th>
            <th>结论</th>
            <th>状态</th>
            <th>是否条件通过</th>
            <th>退回节点</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">
                  <strong>暂无一致性评审记录</strong>
                  <p>驾驶室评审通过并激活一致性评审任务后，可在这里创建记录。</p>
                </div>
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
                <td>{item.reviewConclusion === 'CONDITIONAL_APPROVED' ? '是' : '否'}</td>
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
                                onUploadAttachment(item, file);
                              }

                              event.target.value = '';
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {canShowConsistencyReviewSubmitButton(user, workspace, item) ? (
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
                    {canShowConsistencyReviewApproveButton(user, workspace, item) ? (
                      <button
                        type="button"
                        className="button button-small"
                        disabled={actingKey === `approve:${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onApproveReview(item);
                        }}
                      >
                        {actingKey === `approve:${item.id}` ? '处理中…' : '通过'}
                      </button>
                    ) : null}
                    {canShowConsistencyReviewRejectButton(user, workspace, item) ? (
                      <button
                        type="button"
                        className="button button-secondary button-small"
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
  );
}

export function ConsistencyReviewDetail({
  review,
  downstreamTask,
}: {
  review: ConsistencyReviewRecord | null;
  downstreamTask: ConsistencyReviewWorkspaceResponse['downstreamTask'];
}) {
  if (!review) {
    return (
      <div className="empty-state">
        <strong>请选择一条一致性评审记录</strong>
        <p>这里会展示评审意见、附件和后续排产计划状态。</p>
      </div>
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
          <span>最近结论</span>
          <strong>{getConsistencyReviewConclusionLabel(review.reviewConclusion)}</strong>
        </div>
        <div className="detail-item">
          <span>排产计划状态</span>
          <strong>
            {downstreamTask ? getWorkflowTaskStatusLabel(downstreamTask.status) : '未激活'}
          </strong>
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
          <span>退回目标节点</span>
          <strong>{review.returnToNodeName ?? '未退回'}</strong>
        </div>
        <div className="detail-item">
          <span>已上传附件</span>
          <strong>{review.attachment ? '是' : '否'}</strong>
        </div>
      </div>
      <ReviewAttachmentList
        attachment={review.attachment}
        history={review.attachmentHistory}
      />
    </div>
  );
}

export function ReviewAttachmentList({
  attachment,
  history,
}: {
  attachment: ConsistencyReviewRecord['attachment'];
  history: ConsistencyReviewRecord['attachmentHistory'];
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
  conclusion: ConsistencyReviewRecord['reviewConclusion'];
}) {
  const className =
    conclusion === 'APPROVED'
      ? 'status-pill status-pill-success'
      : conclusion === 'CONDITIONAL_APPROVED'
        ? 'status-pill status-pill-warning'
        : 'status-pill status-pill-danger';

  return <span className={className}>{getConsistencyReviewConclusionLabel(conclusion)}</span>;
}
