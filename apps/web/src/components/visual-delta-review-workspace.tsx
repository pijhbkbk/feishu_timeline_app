'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import {
  approveVisualDeltaReview, canWriteVisualDeltaMonth, canWriteVisualDeltaRecord,
  canShowVisualDeltaReviewApproveButton, canShowVisualDeltaReviewRejectButton, canShowVisualDeltaReviewSubmitButton,
  createVisualDeltaReview, fetchVisualDeltaReviewWorkspace, getVisualDeltaReviewApprovalSuccessMessage,
  getVisualDeltaReviewConclusionLabel, rejectVisualDeltaReview, submitVisualDeltaReview, toVisualDeltaReviewFormInput,
  updateVisualDeltaReview, uploadVisualDeltaReviewAttachment, validateVisualDeltaReviewForm,
  type VisualDeltaReviewFormInput, type VisualDeltaReviewRecord, type VisualDeltaReviewWorkspaceResponse,
} from '../lib/visual-delta-reviews-client';
import { getWorkflowTaskStatusLabel } from '../lib/workflows-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';

const EMPTY_FORM: VisualDeltaReviewFormInput = { reviewDate: '', reviewerId: '', reviewConclusion: 'APPROVED', comment: '', conditionNote: '', rejectReason: '' };

export function VisualDeltaReviewWorkspace({ projectId, recurringTaskId = '' }: { projectId: string; recurringTaskId?: string }) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<VisualDeltaReviewWorkspaceResponse | null>(null);
  const [selectedMonthId, setSelectedMonthId] = useState(recurringTaskId);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [form, setForm] = useState<VisualDeltaReviewFormInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const identity = `${projectId}:${user?.id}:${user?.roleCodes.join(',')}:${recurringTaskId}`;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [identity]);
  const month = workspace?.recurringTasks.find(item => item.id === selectedMonthId);
  const records = month ? workspace?.items.filter(item => item.reviewPeriod === month.plannedDate.slice(0, 7)) ?? [] : [];
  const canWrite = Boolean(workspace && canWriteVisualDeltaMonth(user, workspace, month));
  const selectedReview = records.find(item => item.id === selectedReviewId) ?? records[0] ?? null;
  const ownDraft = records.find(item => item.reviewerId === user?.id && item.workflowTaskId === workspace?.activeTask?.id && !item.submittedAt);
  const ownRecord = records.find(item => item.reviewerId === user?.id && item.workflowTaskId === workspace?.activeTask?.id);
  const defaultDate = month?.plannedDate.slice(0, 10) ?? '';
  useEffect(() => {
    setForm({ ...EMPTY_FORM, reviewDate: defaultDate, reviewerId: user?.id ?? '' });
    setEditingReviewId(null); setSelectedReviewId(null); setNotice('');
  }, [selectedMonthId, defaultDate, user?.id]);
  async function load() {
    const request = ++sequence.current; setLoading(true); setError(''); setWorkspace(null);
    try {
      const result = await fetchVisualDeltaReviewWorkspace(projectId);
      if (request !== sequence.current) return;
      setWorkspace(result);
      setSelectedMonthId(current => current || result.recurringTasks.find(item => canWriteVisualDeltaMonth(user, result, item))?.id || result.recurringTasks[0]?.id || '');
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : '月度评审加载失败。'); }
    finally { if (request === sequence.current) setLoading(false); }
  }
  async function mutate(key: string, action: () => Promise<VisualDeltaReviewWorkspaceResponse>, message: string | ((next: VisualDeltaReviewWorkspaceResponse) => string)) {
    if (busy) return;
    setBusy(key); setError(''); setNotice('');
    try {
      const result = await action();
      if (identity !== currentIdentity.current) return;
      setWorkspace(result); setEditingReviewId(null);
      setForm({ ...EMPTY_FORM, reviewDate: defaultDate, reviewerId: user?.id ?? '' });
      setNotice(typeof message === 'function' ? message(result) : message);
    } catch (e) { if (identity === currentIdentity.current) setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(''); }
  }
  function save() {
    const validation = validateVisualDeltaReviewForm(form);
    if (validation) { setError(validation); return; }
    if (!month || form.reviewDate.slice(0, 7) !== month.plannedDate.slice(0, 7)) { setError('评审日期必须属于所选月份。'); return; }
    void mutate('save', () => editingReviewId ? updateVisualDeltaReview(projectId, editingReviewId, form) : createVisualDeltaReview(projectId, form), '评审记录已保存，请上传必要附件后提交。');
  }
  function edit(review: VisualDeltaReviewRecord) { setEditingReviewId(review.id); setSelectedReviewId(review.id); setForm(toVisualDeltaReviewFormInput(review)); }
  if (loading) return <section className="team-workspace"><p role="status">正在加载月度评审…</p></section>;
  if (!workspace) return <section className="team-workspace"><p role="alert">{error || '月度评审未能加载。'}</p><button className="button" onClick={() => void load()}>重新加载</button></section>;
  return <section className="team-workspace">
    <header className="work-heading"><div><h1>月度目视色差评审</h1><p>{workspace.project.code} · {workspace.project.name}</p></div><Link href={`/projects/${projectId}`}>返回项目</Link></header>
    <div className="work-overview"><label>评审月份 <select value={selectedMonthId} disabled={Boolean(busy)} onChange={event => setSelectedMonthId(event.target.value)}>
      {recurringTaskId && !workspace.recurringTasks.some(item => item.id === recurringTaskId) ? <option value={recurringTaskId}>任务不存在</option> : null}
      {workspace.recurringTasks.map(item => <option key={item.id} value={item.id}>第 {item.periodIndex} 月 · {item.periodLabel}{item.status === 'COMPLETED' ? ' · 已完成' : ''}</option>)}
    </select></label><span>已完成 {workspace.recurringTasks.filter(item => item.status === 'COMPLETED').length} / 12</span><button className="button" disabled={Boolean(busy)} onClick={() => void load()}>刷新</button></div>
    {error ? <p role="alert" className="error-text">{error}</p> : null}{notice ? <p role="status" className="work-notice">{notice}</p> : null}
    {!month ? <p className="work-state">{recurringTaskId ? '未找到所选月度任务，请返回我的工作重新选择。' : '进入月度评审阶段后，将生成 12 个月份。'}</p> : <>
      <p>第 {month.periodIndex} 月 · {month.periodLabel}，计划日期 {formatDate(month.plannedDate)}，期限 {formatDate(month.dueAt)}。</p>
      {!canWrite ? <p className="work-state">{month.status === 'COMPLETED' ? '本月已完成，评审记录保留可查。' : Date.parse(month.plannedDate) > (workspace.businessTime ? Date.parse(workspace.businessTime) : Date.now()) ? '本月尚未到办理日期。' : '仅在月度评审阶段，由已领取本月任务的质量试验人员办理。'} <Link href="/dashboard">打开我的工作</Link></p> :
      <section className="page-card"><h2>{editingReviewId ? '编辑本月评审' : '填写本月评审'}</h2>
        {ownRecord && !editingReviewId ? <p>本月已有本人记录。{ownDraft ? <button className="button" disabled={Boolean(busy)} onClick={() => edit(ownDraft)}>继续填写</button> : '请在下方查看提交结果。'}</p> :
          <VisualDeltaReviewForm value={form} reviewerOptions={user ? [{ id: user.id, name: user.name, departmentId: user.departmentId, departmentName: user.departmentName }] : []}
            disabled={Boolean(busy)} submitLabel={busy === 'save' ? '正在保存…' : '保存评审记录'} onChange={setForm} onSubmit={save} />}
      </section>}
      <section className="page-card"><h2>本月记录与附件</h2><VisualDeltaReviewHistory user={user} items={records} selectedReviewId={selectedReview?.id ?? null} isReadOnly={!canWrite}
        workspace={workspace} actingKey={busy || null} isUploading={busy.startsWith('upload:')} onSelect={setSelectedReviewId} onEdit={edit}
        onSubmitReview={review => void mutate(`submit:${review.id}`, () => submitVisualDeltaReview(projectId, review.id), '评审已提交，请核对后确认通过或驳回。')}
        onApproveReview={review => void mutate(`approve:${review.id}`, () => approveVisualDeltaReview(projectId, review.id), getVisualDeltaReviewApprovalSuccessMessage)}
        onRejectReview={review => void mutate(`reject:${review.id}`, () => rejectVisualDeltaReview(projectId, review.id), '评审已驳回，流程已退回批量生产。')}
        onUploadAttachment={(review, file) => void mutate(`upload:${review.id}`, () => uploadVisualDeltaReviewAttachment(projectId, review.id, file), '附件已保存。')} /></section>
      {selectedReview ? <section className="page-card"><h2>评审详情</h2><VisualDeltaReviewDetail review={selectedReview} downstreamTask={workspace.downstreamTask} /></section> : null}
    </>}
  </section>;
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
  canManage?: boolean;
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
                <td>{item.isPeriodCompleted ? '已完成' : item.submittedAt ? '已提交' : '草稿'}</td>
                <td>{item.reviewConclusion === 'CONDITIONAL_APPROVED' ? '是' : '否'}</td>
                <td>{item.returnToNodeName ?? '未退回'}</td>
                <td>
                  <div className="task-actions">
                    {canWriteVisualDeltaRecord(user, workspace, item) &&
                    !isReadOnly &&
                    !item.submittedAt ? (
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
                        disabled={Boolean(actingKey) || isUploading || actingKey === `submit:${item.id}`}
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
                        disabled={Boolean(actingKey) || isUploading || actingKey === `approve:${item.id}`}
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
                        disabled={Boolean(actingKey) || isUploading || actingKey === `reject:${item.id}`}
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
