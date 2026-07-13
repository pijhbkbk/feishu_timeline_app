'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchAttachmentsByEntity,
  uploadProjectAttachment,
  type ProjectAttachmentSummary,
} from '../lib/attachments-client';
import {
  createTaskProgress,
  fetchTaskList,
  fetchTaskProgress,
  type CreateTaskProgressInput,
  type TaskListItem,
  type TaskProgressItem,
} from '../lib/tasks-client';
import {
  fetchWorkflowTaskInteractionDetail,
  type WorkflowTaskInteractionDetail,
} from '../lib/workflows-client';
import { formatDate, formatDateTime } from '../lib/projects-client';
import { R22Card, R22ProgressBar, R22StatusBadge } from './r22-ui';

type ProgressDraft = {
  completedContent: string;
  nextPlan: string;
  completionPercent: number;
  isBlocked: boolean;
  blockerType: NonNullable<CreateTaskProgressInput['blockerType']>;
  blockerDescription: string;
  helperUserId: string;
  expectedResolvedAt: string;
};

const EMPTY_DRAFT: ProgressDraft = {
  completedContent: '',
  nextPlan: '',
  completionPercent: 40,
  isBlocked: false,
  blockerType: 'MATERIAL',
  blockerDescription: '',
  helperUserId: '',
  expectedResolvedAt: '',
};

const STEPS = [
  { number: 1, title: '做了什么', description: '记录本次完成内容和下一步' },
  { number: 2, title: '是否阻塞', description: '明确问题、协助人与时间' },
  { number: 3, title: '上传材料', description: '提交真实证据并确认' },
] as const;

export function ProgressWorkspaceR22() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [taskId, setTaskId] = useState(searchParams.get('taskId') ?? '');
  const [detail, setDetail] = useState<WorkflowTaskInteractionDetail | null>(null);
  const [history, setHistory] = useState<TaskProgressItem[]>([]);
  const [attachments, setAttachments] = useState<ProjectAttachmentSummary[]>([]);
  const [draft, setDraft] = useState<ProgressDraft>(EMPTY_DRAFT);
  const [activeStep, setActiveStep] = useState(normalizeStep(searchParams.get('step')));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey());
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TaskProgressItem | null>(null);

  useEffect(() => {
    void loadTaskOptions();
  }, []);

  useEffect(() => {
    if (taskId) void loadTaskContext(taskId);
  }, [taskId]);

  async function loadTaskOptions() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchTaskList('my', { pageSize: 30 });
      setTasks(response.items);
      const requestedTask = searchParams.get('taskId');
      const nextTaskId =
        response.items.find((item) => item.taskId === requestedTask)?.taskId ??
        response.items[0]?.taskId ??
        '';
      if (nextTaskId) updateTask(nextTaskId, false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '任务列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTaskContext(nextTaskId: string) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [taskDetail, progress] = await Promise.all([
        fetchWorkflowTaskInteractionDetail(nextTaskId),
        fetchTaskProgress(nextTaskId),
      ]);
      const attachmentResponse = await fetchAttachmentsByEntity(taskDetail.projectId, {
        entityType: 'WORKFLOW_TASK',
        entityId: nextTaskId,
      });
      if (requestId !== requestIdRef.current) return;
      setDetail(taskDetail);
      setHistory(progress.items);
      setAttachments(attachmentResponse.items);
      const latestPercent = progress.items[0]?.completionPercent ?? taskDetail.schedule.progressPercent ?? 40;
      setDraft({ ...EMPTY_DRAFT, completionPercent: Math.max(0, Math.min(100, Math.round(latestPercent))) });
      setSelectedFile(null);
      setIdempotencyKey(createIdempotencyKey());
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : '任务上下文加载失败。');
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  function updateTask(nextTaskId: string, scroll = true) {
    setTaskId(nextTaskId);
    const params = new URLSearchParams(searchParams.toString());
    params.set('taskId', nextTaskId);
    params.set('step', '1');
    setActiveStep(1);
    router.replace(`/progress?${params.toString()}`, { scroll });
  }

  function goToStep(step: number) {
    if (step > 1 && !draft.completedContent.trim()) {
      setError('请先填写本次完成内容。');
      return;
    }
    if (step > 2 && draft.isBlocked && !draft.blockerDescription.trim()) {
      setError('请完整说明当前阻塞。');
      return;
    }
    setError(null);
    setActiveStep(step);
    const params = new URLSearchParams(searchParams.toString());
    if (taskId) params.set('taskId', taskId);
    params.set('step', String(step));
    router.replace(`/progress?${params.toString()}`, { scroll: false });
  }

  async function uploadMaterial() {
    if (!detail || !selectedFile) {
      setError('请先选择要上传的材料。');
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const created = await uploadProjectAttachment(detail.projectId, selectedFile, {
        entityType: 'WORKFLOW_TASK',
        entityId: detail.taskId,
      });
      setAttachments((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '材料上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  async function submitProgress() {
    if (!detail) return;
    if (!draft.completedContent.trim()) {
      setError('请填写本次完成内容。');
      goToStep(1);
      return;
    }
    if (draft.isBlocked && !draft.blockerDescription.trim()) {
      setError('存在阻塞时必须填写阻塞说明。');
      goToStep(2);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const input: CreateTaskProgressInput = {
        completedContent: draft.completedContent.trim(),
        completionPercent: draft.completionPercent,
        isBlocked: draft.isBlocked,
        materialAttachmentIds: attachments.map((item) => item.id),
        idempotencyKey,
        ...(draft.nextPlan.trim() ? { nextPlan: draft.nextPlan.trim() } : {}),
        ...(draft.isBlocked
          ? {
              blockerType: draft.blockerType,
              blockerDescription: draft.blockerDescription.trim(),
              ...(draft.helperUserId ? { helperUserId: draft.helperUserId } : {}),
              ...(draft.expectedResolvedAt
                ? { expectedResolvedAt: new Date(draft.expectedResolvedAt).toISOString() }
                : {}),
            }
          : {}),
      };
      const created = await createTaskProgress(detail.taskId, input);
      setSuccess(created);
      setHistory((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setIdempotencyKey(createIdempotencyKey());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '进展提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedTask = useMemo(() => tasks.find((task) => task.taskId === taskId) ?? null, [taskId, tasks]);

  if (isLoading && !detail) return <ProgressSkeleton />;

  if (!detail) {
    return (
      <R22Card className="r22-state-card">
        <R22StatusBadge tone={error ? 'danger' : 'neutral'}>{error ? '加载失败' : '暂无任务'}</R22StatusBadge>
        <h1>{error ? '无法打开进展提交' : '当前没有可提交进展的任务'}</h1>
        <p>{error ?? '新的工序任务分配后，会自动出现在这里。'}</p>
        <button type="button" className="r22-button r22-button-primary" onClick={() => void loadTaskOptions()}>重新加载</button>
      </R22Card>
    );
  }

  return (
    <div className="r22-page r22-progress-page" data-testid="progress-page">
      <header className="r22-page-hero r22-progress-hero">
        <div>
          <p className="r22-overline">60 秒完成</p>
          <h1>提交工作进展</h1>
          <p>只记录事实、阻塞和证据，不在这里直接改变流程状态。</p>
        </div>
        <label className="r22-task-picker">
          <span>当前任务</span>
          <select value={taskId} onChange={(event) => updateTask(event.target.value)}>
            {tasks.map((task) => <option key={task.taskId} value={task.taskId}>{task.projectName} · {task.nodeName}</option>)}
          </select>
        </label>
      </header>

      <div className="r22-progress-layout">
        <aside className="r22-progress-stepper" aria-label="进展提交步骤">
          {STEPS.map((step) => (
            <button key={step.number} type="button" className={activeStep === step.number ? 'is-active' : activeStep > step.number ? 'is-complete' : ''} onClick={() => goToStep(step.number)}>
              <span>{activeStep > step.number ? '✓' : step.number}</span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </button>
          ))}
          <div className="r22-progress-rule">
            <span>安全边界</span>
            <p>进展记录只追加历史；流程推进仍由后端状态机裁决。</p>
          </div>
        </aside>

        <R22Card className="r22-progress-form-card">
          {error ? <div className="r22-inline-alert" role="alert">{error}</div> : null}
          {success ? (
            <ProgressSuccess progress={success} detail={detail} onContinue={() => { setSuccess(null); setDraft({ ...EMPTY_DRAFT, completionPercent: success.completionPercent }); goToStep(1); }} />
          ) : (
            <>
              {activeStep === 1 ? <ProgressStepOne draft={draft} onChange={setDraft} detail={detail} /> : null}
              {activeStep === 2 ? <ProgressStepTwo draft={draft} onChange={setDraft} detail={detail} /> : null}
              {activeStep === 3 ? (
                <ProgressStepThree
                  draft={draft}
                  attachments={attachments}
                  selectedFile={selectedFile}
                  isUploading={isUploading}
                  isSubmitting={isSubmitting}
                  onFileChange={setSelectedFile}
                  onUpload={() => void uploadMaterial()}
                  onSubmit={() => void submitProgress()}
                />
              ) : null}

              <div className="r22-progress-form-actions">
                {activeStep > 1 ? <button type="button" className="r22-button r22-button-secondary" onClick={() => goToStep(activeStep - 1)}>上一步</button> : <span />}
                {activeStep < 3 ? <button type="button" className="r22-button r22-button-primary" onClick={() => goToStep(activeStep + 1)}>继续</button> : null}
              </div>
            </>
          )}
        </R22Card>

        <aside className="r22-progress-context">
          <R22Card>
            <R22StatusBadge tone={selectedTask?.isOverdue ? 'danger' : 'brand'}>{detail.statusLabel}</R22StatusBadge>
            <h2>{detail.stepName}</h2>
            <p>{detail.project.name}</p>
            <dl>
              <div><dt>负责人</dt><dd>{detail.owner?.name ?? '待分配'}</dd></div>
              <div><dt>截止时间</dt><dd>{formatDate(detail.deadline)}</dd></div>
              <div><dt>最新进度</dt><dd>{history[0]?.completionPercent ?? 0}%</dd></div>
              <div><dt>材料</dt><dd>{attachments.length} 份</dd></div>
            </dl>
            <R22ProgressBar value={draft.completionPercent} />
            <Link href={`/projects/${detail.projectId}`} className="r22-text-link">查看项目工作区</Link>
          </R22Card>
          {history[0] ? (
            <R22Card className="r22-latest-progress">
              <span>上次提交</span>
              <strong>{history[0].completedContent}</strong>
              <time>{formatDateTime(history[0].createdAt)}</time>
            </R22Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ProgressStepOne({ draft, onChange, detail }: { draft: ProgressDraft; onChange: (value: ProgressDraft) => void; detail: WorkflowTaskInteractionDetail }) {
  return (
    <div className="r22-progress-step-content">
      <div><p className="r22-overline">步骤 1 / 3</p><h2>这次具体做了什么？</h2><p>用可验证的事实描述结果，不需要写成长篇周报。</p></div>
      <label className="r22-field r22-field-large"><span>本次完成内容 <b>*</b></span><textarea autoFocus value={draft.completedContent} maxLength={4000} placeholder={`例如：已完成${detail.stepName}的首轮确认，并同步供应商修订参数。`} onChange={(event) => onChange({ ...draft, completedContent: event.target.value })} /><small>{draft.completedContent.length} / 4000</small></label>
      <label className="r22-field"><span>下一步计划</span><textarea value={draft.nextPlan} maxLength={2000} placeholder="下一步准备推进什么？" onChange={(event) => onChange({ ...draft, nextPlan: event.target.value })} /></label>
      <label className="r22-field r22-range-field"><span>当前完成度 <strong>{draft.completionPercent}%</strong></span><input type="range" min="0" max="100" step="5" value={draft.completionPercent} onChange={(event) => onChange({ ...draft, completionPercent: Number(event.target.value) })} /><R22ProgressBar value={draft.completionPercent} /></label>
    </div>
  );
}

function ProgressStepTwo({ draft, onChange, detail }: { draft: ProgressDraft; onChange: (value: ProgressDraft) => void; detail: WorkflowTaskInteractionDetail }) {
  const helpers = [detail.owner, ...detail.collaborators].filter((person): person is NonNullable<typeof person> => Boolean(person));
  return (
    <div className="r22-progress-step-content">
      <div><p className="r22-overline">步骤 2 / 3</p><h2>当前是否被阻塞？</h2><p>阻塞会进入真实项目风险记录，帮助责任人尽快介入。</p></div>
      <div className="r22-choice-grid" role="radiogroup" aria-label="是否阻塞">
        <button type="button" className={!draft.isBlocked ? 'is-selected' : ''} onClick={() => onChange({ ...draft, isBlocked: false })}><span>✓</span><strong>没有阻塞</strong><small>可以按计划继续推进</small></button>
        <button type="button" className={draft.isBlocked ? 'is-selected is-danger' : ''} onClick={() => onChange({ ...draft, isBlocked: true })}><span>!</span><strong>存在阻塞</strong><small>需要记录问题和协助人</small></button>
      </div>
      {draft.isBlocked ? (
        <div className="r22-blocker-fields">
          <label className="r22-field"><span>阻塞类型 <b>*</b></span><select value={draft.blockerType} onChange={(event) => onChange({ ...draft, blockerType: event.target.value as ProgressDraft['blockerType'] })}><option value="MATERIAL">材料缺失</option><option value="SUPPLIER">供应商协同</option><option value="TECHNICAL">技术问题</option><option value="REVIEW">等待评审</option><option value="SCHEDULE">排期冲突</option><option value="OTHER">其他</option></select></label>
          <label className="r22-field r22-field-full"><span>阻塞说明 <b>*</b></span><textarea value={draft.blockerDescription} placeholder="说明卡在哪里、需要什么才能继续。" onChange={(event) => onChange({ ...draft, blockerDescription: event.target.value })} /></label>
          <label className="r22-field"><span>需要谁协助</span><select value={draft.helperUserId} onChange={(event) => onChange({ ...draft, helperUserId: event.target.value })}><option value="">暂不指定</option>{helpers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.departmentName ?? '未分配部门'}</option>)}</select></label>
          <label className="r22-field"><span>预计解除时间</span><input type="datetime-local" value={draft.expectedResolvedAt} onChange={(event) => onChange({ ...draft, expectedResolvedAt: event.target.value })} /></label>
        </div>
      ) : <div className="r22-clear-state"><span>✓</span><div><strong>当前推进顺畅</strong><p>提交后不会生成阻塞记录。</p></div></div>}
    </div>
  );
}

function ProgressStepThree({ draft, attachments, selectedFile, isUploading, isSubmitting, onFileChange, onUpload, onSubmit }: { draft: ProgressDraft; attachments: ProjectAttachmentSummary[]; selectedFile: File | null; isUploading: boolean; isSubmitting: boolean; onFileChange: (file: File | null) => void; onUpload: () => void; onSubmit: () => void }) {
  return (
    <div className="r22-progress-step-content">
      <div><p className="r22-overline">步骤 3 / 3</p><h2>上传材料并确认</h2><p>材料通过现有安全链路上传，对象存储保存文件，数据库只保存元数据和业务关系。</p></div>
      <div className="r22-upload-zone">
        <span className="r22-upload-icon" aria-hidden="true">↑</span>
        <strong>{selectedFile ? selectedFile.name : '选择本次进展材料'}</strong>
        <p>支持 JPG、PNG、PDF、DOCX、XLSX；服务端会校验扩展名、MIME 和文件内容。</p>
        <label className="r22-file-button"><input type="file" accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} /><span>{selectedFile ? '重新选择' : '选择文件'}</span></label>
        <button type="button" className="r22-button r22-button-secondary" disabled={!selectedFile || isUploading} onClick={onUpload}>{isUploading ? '正在安全上传…' : '上传这份材料'}</button>
      </div>
      {attachments.length > 0 ? <div className="r22-uploaded-list"><span>已绑定到当前任务</span>{attachments.map((attachment) => <article key={attachment.id}><span>✓</span><div><strong>{attachment.fileName}</strong><small>{attachment.uploadedByName ?? '当前用户'} · {formatDateTime(attachment.uploadedAt)}</small></div></article>)}</div> : null}
      <div className="r22-submit-summary"><div><span>完成内容</span><strong>{draft.completedContent}</strong></div><div><span>当前进度</span><strong>{draft.completionPercent}%</strong></div><div><span>阻塞状态</span><strong className={draft.isBlocked ? 'is-danger' : ''}>{draft.isBlocked ? '存在阻塞' : '无阻塞'}</strong></div><div><span>材料数量</span><strong>{attachments.length} 份</strong></div></div>
      <button type="button" className="r22-button r22-button-primary r22-submit-progress" disabled={isSubmitting} onClick={onSubmit}>{isSubmitting ? '正在提交…' : '确认提交工作进展'}</button>
    </div>
  );
}

function ProgressSuccess({ progress, detail, onContinue }: { progress: TaskProgressItem; detail: WorkflowTaskInteractionDetail; onContinue: () => void }) {
  return <div className="r22-progress-success"><span aria-hidden="true">✓</span><R22StatusBadge tone="success">提交成功</R22StatusBadge><h2>进展已写入项目历史</h2><p>{detail.project.name} · {detail.stepName} 当前记录为 {progress.completionPercent}%</p><div><Link href={`/projects/${detail.projectId}`} className="r22-button r22-button-primary">返回项目工作区</Link><button type="button" className="r22-button r22-button-secondary" onClick={onContinue}>继续记录</button></div></div>;
}

function ProgressSkeleton() {
  return <div className="r22-page r22-skeleton-page"><div className="r22-skeleton r22-skeleton-title" /><div className="r22-progress-layout"><div className="r22-skeleton r22-skeleton-panel" /><div className="r22-skeleton r22-skeleton-map" /><div className="r22-skeleton r22-skeleton-panel" /></div></div>;
}

function normalizeStep(value: string | null) {
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 3 ? parsed : 1;
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `progress-${crypto.randomUUID()}`;
  return `progress-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
