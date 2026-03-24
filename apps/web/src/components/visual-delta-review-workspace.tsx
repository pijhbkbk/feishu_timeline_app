'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  approveVisualDeltaReview,
  canManageVisualDeltaReviews,
  canShowVisualDeltaReviewApproveButton,
  canShowVisualDeltaReviewRejectButton,
  canShowVisualDeltaReviewSubmitButton,
  createVisualDeltaReview,
  fetchVisualDeltaReviewPageOptions,
  fetchVisualDeltaReviewWorkspace,
  getDefaultVisualDeltaReviewerId,
  getVisualDeltaReviewConclusionLabel,
  getVisualDeltaReviewWorkspaceHighlights,
  rejectVisualDeltaReview,
  submitVisualDeltaReview,
  toVisualDeltaReviewFormInput,
  updateVisualDeltaReview,
  uploadVisualDeltaReviewAttachment,
  validateVisualDeltaReviewForm,
  type VisualDeltaReviewFormInput,
  type VisualDeltaReviewRecord,
  type VisualDeltaReviewWorkspaceResponse,
} from '../lib/visual-delta-reviews-client';
import { type DirectoryUser, formatDate, getWorkflowNodeLabel } from '../lib/projects-client';
import { getWorkflowTaskStatusLabel, isWorkflowTaskOverdue } from '../lib/workflows-client';

type VisualDeltaReviewWorkspaceProps = {
  projectId: string;
};

const EMPTY_FORM: VisualDeltaReviewFormInput = {
  reviewDate: '',
  reviewerId: '',
  reviewConclusion: 'APPROVED',
  comment: '',
  conditionNote: '',
  rejectReason: '',
};

export function VisualDeltaReviewWorkspace({
  projectId,
}: VisualDeltaReviewWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<VisualDeltaReviewWorkspaceResponse | null>(null);
  const [reviewerOptions, setReviewerOptions] = useState<DirectoryUser[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState<VisualDeltaReviewFormInput>(EMPTY_FORM);
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

  const canManage = canManageVisualDeltaReviews(user);
  const highlights = workspace ? getVisualDeltaReviewWorkspaceHighlights(workspace) : null;
  const selectedReview =
    workspace?.items.find((item) => item.id === selectedReviewId) ?? null;
  const latestReview = workspace?.items[0] ?? null;
  const isReadOnly = !workspace?.activeTask;

  const summaryCards = useMemo(
    () => [
      {
        label: '目视色差评审任务',
        value: highlights?.activeTaskStatusLabel ?? '当前无目视色差评审任务',
      },
      {
        label: '批量生产状态',
        value: workspace?.massProductionCompleted ? '已完成' : '未完成',
      },
      {
        label: '颜色退出/收尾',
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
        fetchVisualDeltaReviewWorkspace(projectId),
        fetchVisualDeltaReviewPageOptions(),
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
            : getDefaultVisualDeltaReviewerId(users, user?.id ?? null),
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '目视色差评审工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    const validationMessage = validateVisualDeltaReviewForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingReviewId
        ? await updateVisualDeltaReview(projectId, editingReviewId, form)
        : await createVisualDeltaReview(projectId, form);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultVisualDeltaReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(
        editingReviewId ? '目视色差评审记录已更新。' : '目视色差评审记录已创建。',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '目视色差评审记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReviewAction(
    action: 'SUBMIT' | 'APPROVE' | 'REJECT',
    review: VisualDeltaReviewRecord,
  ) {
    setActingKey(`${action.toLowerCase()}:${review.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace =
        action === 'SUBMIT'
          ? await submitVisualDeltaReview(projectId, review.id)
          : action === 'APPROVE'
            ? await approveVisualDeltaReview(projectId, review.id)
            : await rejectVisualDeltaReview(projectId, review.id);

      setWorkspace(nextWorkspace);
      setEditingReviewId(null);
      setForm({
        ...EMPTY_FORM,
        reviewerId: getDefaultVisualDeltaReviewerId(reviewerOptions, user?.id ?? null),
      });
      setSuccessMessage(
        action === 'SUBMIT'
          ? '目视色差评审记录已提交。'
          : action === 'APPROVE'
            ? '目视色差评审已通过，颜色退出/收尾节点已可进入。'
            : '目视色差评审已驳回，流程已退回批量生产。',
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '目视色差评审动作执行失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleUploadAttachment(review: VisualDeltaReviewRecord, file: File) {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await uploadVisualDeltaReviewAttachment(projectId, review.id, file);
      setWorkspace(nextWorkspace);
      setSuccessMessage(`目视色差评审记录 ${review.id} 已上传附件。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '目视色差评审附件上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  function resetForm() {
    setEditingReviewId(null);
    setForm({
      ...EMPTY_FORM,
      reviewerId: getDefaultVisualDeltaReviewerId(reviewerOptions, user?.id ?? null),
    });
  }

  function prepareEdit(review: VisualDeltaReviewRecord) {
    if (review.submittedAt) {
      return;
    }

    setSelectedReviewId(review.id);
    setEditingReviewId(review.id);
    setForm(toVisualDeltaReviewFormInput(review));
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Visual Delta Review</p>
        <h1>正在加载目视色差评审模块…</h1>
        <p>评审记录、附件和颜色退出/项目收尾联动状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Visual Delta Review</p>
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
            <Link href={`/projects/${projectId}/mass-production`} className="button button-secondary">
              查看批量生产
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
                ? getVisualDeltaReviewConclusionLabel(latestReview.reviewConclusion)
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
          <p className="error-text">当前目视色差评审任务已超期。</p>
        ) : null}
        {!workspace.massProductionCompleted ? (
          <p className="muted">批量生产完成后才会激活目视色差评审任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review Form</p>
            <h2 className="section-title">目视色差评审表单</h2>
            <p className="muted">提交后由后端判定通过或驳回，并推进或退回流程。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <VisualDeltaReviewForm
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
            <h2 className="section-title">目视色差评审历史</h2>
            <p className="muted">支持查看提交状态、条件通过说明、退回记录和附件。</p>
          </div>
        </div>
        <VisualDeltaReviewHistory
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
            <h2 className="section-title">目视色差评审详情</h2>
            <p className="muted">展示评审意见、附件历史、退回记录和项目收尾状态。</p>
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
        <VisualDeltaReviewDetail
          review={selectedReview}
          downstreamTask={workspace.downstreamTask}
        />
      </section>
    </div>
  );
}

export function VisualDeltaReviewForm({
  value,
  reviewerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: VisualDeltaReviewFormInput;
  reviewerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: VisualDeltaReviewFormInput) => void;
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
              reviewConclusion: event.target.value as VisualDeltaReviewFormInput['reviewConclusion'],
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

export function VisualDeltaReviewHistory({
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
  items: VisualDeltaReviewRecord[];
  selectedReviewId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  workspace: VisualDeltaReviewWorkspaceResponse;
  actingKey: string | null;
  isUploading: boolean;
  onSelect: (reviewId: string) => void;
  onEdit: (review: VisualDeltaReviewRecord) => void;
  onSubmitReview: (review: VisualDeltaReviewRecord) => void;
  onApproveReview: (review: VisualDeltaReviewRecord) => void;
  onRejectReview: (review: VisualDeltaReviewRecord) => void;
  onUploadAttachment: (review: VisualDeltaReviewRecord, file: File) => void;
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
                  <strong>暂无目视色差评审记录</strong>
                  <p>批量生产完成并激活目视色差评审任务后，可在这里创建记录。</p>
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
                  <ReviewResultBadge conclusion={item.reviewConclusion} />
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
                    {canShowVisualDeltaReviewSubmitButton(user, workspace, item) ? (
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
                    {canShowVisualDeltaReviewApproveButton(user, workspace, item) ? (
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
                    {canShowVisualDeltaReviewRejectButton(user, workspace, item) ? (
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

export function VisualDeltaReviewDetail({
  review,
  downstreamTask,
}: {
  review: VisualDeltaReviewRecord | null;
  downstreamTask: VisualDeltaReviewWorkspaceResponse['downstreamTask'];
}) {
  if (!review) {
    return (
      <div className="empty-state">
        <strong>请选择一条目视色差评审记录</strong>
        <p>详情区会展示评审意见、附件历史、退回记录和颜色退出/项目收尾状态。</p>
      </div>
    );
  }

  return (
    <div className="page-stack compact">
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>评审结论</span>
          <strong>{getVisualDeltaReviewConclusionLabel(review.reviewConclusion)}</strong>
        </div>
        <div className="metadata-item">
          <span>评审时间</span>
          <strong>{formatDate(review.reviewDate)}</strong>
        </div>
        <div className="metadata-item">
          <span>评审人</span>
          <strong>{review.reviewerName ?? '未指定'}</strong>
        </div>
        <div className="metadata-item">
          <span>颜色退出/收尾</span>
          <strong>
            {downstreamTask ? getWorkflowTaskStatusLabel(downstreamTask.status) : '未激活'}
          </strong>
        </div>
      </div>
      <div className="detail-block">
        <h3>评审意见</h3>
        <p>{review.comment ?? '无'}</p>
      </div>
      <div className="detail-block">
        <h3>条件通过说明</h3>
        <p>{review.conditionNote ?? '无'}</p>
      </div>
      <div className="detail-block">
        <h3>驳回原因</h3>
        <p>{review.rejectReason ?? '无'}</p>
      </div>
      <div className="detail-block">
        <h3>附件</h3>
        {review.attachmentHistory.length === 0 ? (
          <p>暂无附件</p>
        ) : (
          <ul className="attachment-list">
            {review.attachmentHistory.map((attachment) => (
              <li key={attachment.id}>
                <a href={attachment.contentUrl} target="_blank" rel="noreferrer">
                  {attachment.fileName}
                </a>
                <span>{formatDate(attachment.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ReviewResultBadge({
  conclusion,
}: {
  conclusion: VisualDeltaReviewRecord['reviewConclusion'];
}) {
  const className =
    conclusion === 'APPROVED'
      ? 'status-pill status-pill-success'
      : conclusion === 'CONDITIONAL_APPROVED'
        ? 'status-pill status-pill-warning'
        : 'status-pill status-pill-danger';

  return <span className={className}>{getVisualDeltaReviewConclusionLabel(conclusion)}</span>;
}
