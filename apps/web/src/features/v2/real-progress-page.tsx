'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import {
  createGate3BIdempotencyKey,
  r26Gate3BJsonRequest,
  r26Gate3BUpload,
} from './r26-gate3b-client';
import { API_BASE_URL } from '../../lib/auth-client';
import type {
  R26ProgressCommandResponse,
  R26ProgressResponse,
  R26ProgressStatus,
} from './real-types';
import { RealDataState } from './real-ui';
import {
  ArrowLeftIcon,
  CheckIcon,
  CloseIcon,
  UploadIcon,
} from './icons';
import { PageIntro, StatusPill } from './ui';
import { useR26ReadOnlyData } from './use-r26-readonly-data';

type FormState = {
  progressStatus: R26ProgressStatus;
  completedWork: string;
  nextPlan: string;
  blockerType: string;
  blockerDescription: string;
  assistanceUserIds: string[];
  assistanceDepartmentIds: string[];
  expectedResolvedAt: string;
  impactLevel: string;
};

const EMPTY_FORM: FormState = {
  progressStatus: 'IN_PROGRESS',
  completedWork: '',
  nextPlan: '',
  blockerType: 'WAITING_MATERIAL',
  blockerDescription: '',
  assistanceUserIds: [],
  assistanceDepartmentIds: [],
  expectedResolvedAt: '',
  impactLevel: 'NO_DEADLINE_IMPACT',
};

const STEPS = [
  { number: 1, title: '本次做了什么', description: '记录事实与下一步' },
  { number: 2, title: '是否存在阻塞', description: '明确协助和解除时间' },
  { number: 3, title: '上传证明材料', description: '补齐当前工序证据' },
];

const STATUS_OPTIONS: Array<{
  value: R26ProgressStatus;
  label: string;
  description: string;
}> = [
  {
    value: 'NOT_STARTED',
    label: '尚未开始',
    description: '记录准备情况，不改变任务状态',
  },
  {
    value: 'IN_PROGRESS',
    label: '正在进行',
    description: '本次工作仍在按计划推进',
  },
  {
    value: 'BLOCKED',
    label: '遇到阻塞',
    description: '需要人员或部门协助',
  },
  {
    value: 'WORK_COMPLETE_PENDING_TASK_COMPLETION',
    label: '本次工作已完成',
    description: '仅记录事实，不会完成工序',
  },
];

export function RealProgressPage() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get('taskId');
  const projectId = searchParams.get('projectId');
  const path = taskId
    ? `/v2/tasks/${encodeURIComponent(taskId)}/progress-context`
    : null;
  const {
    data,
    error,
    loading,
    refresh,
  } = useR26ReadOnlyData<R26ProgressResponse>(path);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const initializedTaskRef = useRef<string | null>(null);
  const pendingRecoveryRef = useRef(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [localRecovery, setLocalRecovery] = useState<FormState | null>(
    null,
  );
  const [draftVersion, setDraftVersion] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [materialType, setMaterialType] = useState('');
  const [replaceAttachmentId, setReplaceAttachmentId] = useState<string | null>(
    null,
  );
  const [uploadedAttachmentIds, setUploadedAttachmentIds] = useState<string[]>(
    [],
  );
  const [pendingAction, setPendingAction] = useState<
    'draft' | 'delete' | 'upload' | 'submit' | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] =
    useState<R26ProgressCommandResponse | null>(null);

  useEffect(() => {
    if (!data || !taskId || initializedTaskRef.current === taskId) {
      return;
    }
    initializedTaskRef.current = taskId;
    const local = readLocalDraft(taskId, data.viewer.id);
    const source = data.draft
      ? {
          progressStatus: data.draft.progressStatus,
          completedWork: data.draft.completedWork ?? '',
          nextPlan: data.draft.nextPlan ?? '',
          blockerType: data.draft.blockerType ?? 'WAITING_MATERIAL',
          blockerDescription: data.draft.blockerDescription ?? '',
          assistanceUserIds: data.draft.assistanceUserIds,
          assistanceDepartmentIds: data.draft.assistanceDepartmentIds,
          expectedResolvedAt: toDateTimeLocal(
            data.draft.expectedResolvedAt,
          ),
          impactLevel:
            data.draft.impactLevel ?? 'NO_DEADLINE_IMPACT',
        }
      : EMPTY_FORM;
    setForm(source);
    setDraftVersion(data.draft?.draftVersion ?? 0);
    const firstMissing = data.materials.requirements.find(
      (item) => item.status === 'MISSING',
    );
    setMaterialType(
      firstMissing?.id ??
        data.materials.requirements[0]?.id ??
        'WORK_EVIDENCE',
    );
    if (local) {
      pendingRecoveryRef.current = true;
      setLocalRecovery(local);
    }
  }, [data, taskId]);

  useEffect(() => {
    if (
      !taskId ||
      !data?.viewer.id ||
      initializedTaskRef.current !== taskId ||
      pendingRecoveryRef.current ||
      success
    ) {
      return;
    }
    window.localStorage.setItem(
      localDraftKey(taskId, data.viewer.id),
      JSON.stringify(form),
    );
  }, [data?.viewer.id, form, success, taskId]);

  const activeAttachmentIds = useMemo(
    () => [
      ...new Set([
        ...(data?.materials.current.map((item) => item.id) ?? []),
        ...uploadedAttachmentIds,
      ]),
    ],
    [data?.materials.current, uploadedAttachmentIds],
  );

  if (!taskId) {
    return (
      <div className="r26-page">
        <section className="r26-empty-state">
          <strong>请选择需要提交进展的工序</strong>
          <p>请从工作台或项目工作区进入，系统会自动带入项目和工序。</p>
          <Link className="r26-button r26-button--primary" href="/v2/dashboard">
            返回工作台
          </Link>
        </section>
      </div>
    );
  }

  if (loading || error || !data) {
    return (
      <RealDataState
        loading={loading}
        error={error}
        label="正在读取真实进展与材料上下文…"
      />
    );
  }

  const activeTaskId = taskId;
  const progressData = data;
  const { task, viewer } = data;
  const canSubmit = data.availableActions.some(
    (action) => action.action === 'SUBMIT_PROGRESS',
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setActionError(null);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }

  function validateStep(targetStep: number) {
    if (targetStep >= 1 && !form.completedWork.trim()) {
      setActionError('请填写本次完成内容。');
      return false;
    }
    if (targetStep >= 1 && !form.nextPlan.trim()) {
      setActionError('请填写下一步计划。');
      return false;
    }
    if (
      targetStep >= 2 &&
      form.progressStatus === 'BLOCKED' &&
      (!form.blockerDescription.trim() ||
        !form.expectedResolvedAt ||
        (!form.assistanceUserIds.length &&
          !form.assistanceDepartmentIds.length))
    ) {
      setActionError(
        '存在阻塞时，请填写说明、预计解除时间，并选择协助人员或部门。',
      );
      return false;
    }
    if (
      targetStep >= 2 &&
      form.progressStatus === 'BLOCKED' &&
      !parseLocalDateTime(form.expectedResolvedAt)
    ) {
      setActionError('预计解除时间格式应为 YYYY-MM-DD HH:mm。');
      return false;
    }
    setActionError(null);
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(3, current + 1));
  }

  async function saveDraft() {
    setPendingAction('draft');
    setActionError(null);
    const idempotencyKey = createGate3BIdempotencyKey('draft-save');
    try {
      const response =
        await r26Gate3BJsonRequest<R26ProgressCommandResponse>(
          `/v2/tasks/${encodeURIComponent(activeTaskId)}/progress-draft`,
          {
            method: 'PUT',
            idempotencyKey,
            body: {
              ...toCommandFields(form),
              draftVersion,
              idempotencyKey,
            },
          },
        );
      if (response.draft) {
        setDraftVersion(response.draft.draftVersion);
      }
      showNotice('草稿已安全保存，刷新或重新登录后可以继续。');
      refresh();
    } catch (requestError) {
      setActionError(toErrorMessage(requestError, '草稿保存失败。'));
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteDraft() {
    if (draftVersion < 1) {
      window.localStorage.removeItem(
        localDraftKey(activeTaskId, viewer.id),
      );
      setForm(EMPTY_FORM);
      showNotice('本机未提交内容已清除。');
      return;
    }
    setPendingAction('delete');
    setActionError(null);
    const idempotencyKey = createGate3BIdempotencyKey('draft-delete');
    try {
      await r26Gate3BJsonRequest<R26ProgressCommandResponse>(
        `/v2/tasks/${encodeURIComponent(activeTaskId)}/progress-draft`,
        {
          method: 'DELETE',
          idempotencyKey,
          body: { draftVersion, idempotencyKey },
        },
      );
      setDraftVersion(0);
      setForm(EMPTY_FORM);
      window.localStorage.removeItem(
        localDraftKey(activeTaskId, viewer.id),
      );
      showNotice('草稿已删除。');
      refresh();
    } catch (requestError) {
      setActionError(toErrorMessage(requestError, '草稿删除失败。'));
    } finally {
      setPendingAction(null);
    }
  }

  function acceptFile(file: File | undefined) {
    if (!file) return;
    setSelectedFile(file);
    setActionError(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    acceptFile(event.dataTransfer.files[0]);
  }

  async function uploadMaterial() {
    if (!selectedFile) {
      setActionError('请先选择要上传的材料。');
      return;
    }
    setPendingAction('upload');
    setActionError(null);
    const idempotencyKey = createGate3BIdempotencyKey(
      replaceAttachmentId ? 'material-replace' : 'material-upload',
    );
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('materialType', materialType);
    formData.append('taskVersion', progressData.taskVersion);
    formData.append('idempotencyKey', idempotencyKey);
    if (replaceAttachmentId) {
      formData.append('replacesAttachmentId', replaceAttachmentId);
    }
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    try {
      const response = await r26Gate3BUpload<R26ProgressCommandResponse>(
        replaceAttachmentId
          ? `/v2/tasks/${encodeURIComponent(activeTaskId)}/materials/${encodeURIComponent(replaceAttachmentId)}/versions`
          : `/v2/tasks/${encodeURIComponent(activeTaskId)}/materials`,
        {
          formData,
          idempotencyKey,
          signal: controller.signal,
        },
      );
      if (response.attachment?.id) {
        setUploadedAttachmentIds((current) => [
          ...new Set([...current, response.attachment!.id]),
        ]);
      }
      setSelectedFile(null);
      setReplaceAttachmentId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showNotice(
        response.attachment
          ? `${response.attachment.fileName} 已上传为 V${response.attachment.versionNo}。`
          : '材料已上传。',
      );
      window.dispatchEvent(new Event('r26:data-changed'));
      refresh();
    } catch (requestError) {
      setActionError(
        requestError instanceof DOMException &&
          requestError.name === 'AbortError'
          ? '已取消本次上传，未生成材料元数据。'
          : toErrorMessage(requestError, '材料上传失败。'),
      );
    } finally {
      uploadControllerRef.current = null;
      setPendingAction(null);
    }
  }

  async function submitProgress() {
    if (!validateStep(2)) {
      setStep(form.completedWork.trim() && form.nextPlan.trim() ? 2 : 1);
      return;
    }
    setPendingAction('submit');
    setActionError(null);
    const idempotencyKey = createGate3BIdempotencyKey('progress-submit');
    try {
      const response =
        await r26Gate3BJsonRequest<R26ProgressCommandResponse>(
          `/v2/tasks/${encodeURIComponent(activeTaskId)}/progress-updates`,
          {
            method: 'POST',
            idempotencyKey,
            body: {
              ...toCommandFields(form),
              attachmentIds: activeAttachmentIds,
              taskVersion: progressData.taskVersion,
              idempotencyKey,
            },
          },
        );
      if (response.taskStatusChanged || response.workflowTransitioned) {
        throw new Error('安全断言失败：进展提交意外改变了流程。');
      }
      setSuccess(response);
      setDraftVersion(0);
      window.localStorage.removeItem(
        localDraftKey(activeTaskId, viewer.id),
      );
      window.dispatchEvent(new Event('r26:data-changed'));
      refresh();
    } catch (requestError) {
      setActionError(toErrorMessage(requestError, '进展提交失败。'));
    } finally {
      setPendingAction(null);
    }
  }

  if (success) {
    return (
      <div
        className="r26-page r26-progress-page"
        data-testid="r26-progress-success"
      >
        <section className="r26-success-state">
          <span className="r26-success-state__icon">
            <CheckIcon />
          </span>
          <p className="r26-eyebrow">真实进展已记录</p>
          <h1>本次进展提交成功</h1>
          <p>
            工作台、项目卡、流程节点、工序详情与项目记录将读取同一条最新事实。
          </p>
          <div className="r26-gate3b-invariant">
            <strong>流程没有被推进</strong>
            <span>
              任务状态未改变 · 当前节点未改变 · 未创建下一工序
            </span>
          </div>
          <div className="r26-success-state__summary">
            <div>
              <span>项目</span>
              <strong>{task.project.name}</strong>
            </div>
            <div>
              <span>工序</span>
              <strong>
                第 {String(task.stepNumber).padStart(2, '0')} 步 ·{' '}
                {task.stepName}
              </strong>
            </div>
            <div>
              <span>材料</span>
              <strong>{activeAttachmentIds.length} 份当前版本</strong>
            </div>
          </div>
          <div className="r26-success-state__actions">
            <Link
              href={`/v2/projects/${encodeURIComponent(projectId ?? task.projectId)}?taskId=${encodeURIComponent(task.taskId)}`}
              className="r26-button r26-button--primary"
            >
              查看更新后的项目
            </Link>
            <Link
              href="/v2/dashboard"
              className="r26-button r26-button--secondary"
            >
              返回工作台
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="r26-page r26-progress-page"
      data-testid="r26-progress"
      data-source="database"
    >
      <div className="r26-readonly-banner r26-gate3b-banner" role="status">
        <strong>Gate 3B · 真实进展与材料</strong>
        <span>{data.notice}</span>
      </div>
      <PageIntro
        eyebrow="60 秒完成"
        title="提交工序进展"
        description="项目、工序、人员与截止时间已经自动带入，只需记录本次事实、阻塞和材料。"
      />

      {localRecovery ? (
        <section className="r26-local-recovery" role="alert">
          <div>
            <strong>发现本机保留的未提交内容</strong>
            <p>
              这可能来自登录过期前的输入。请确认恢复，系统不会自动覆盖服务器草稿。
            </p>
          </div>
          <div>
            <button
              type="button"
              className="r26-button r26-button--primary"
              onClick={() => {
                setForm(localRecovery);
                setLocalRecovery(null);
                pendingRecoveryRef.current = false;
                showNotice('已恢复本机未提交内容。');
              }}
            >
              恢复内容
            </button>
            <button
              type="button"
              className="r26-button r26-button--secondary"
              onClick={() => {
                window.localStorage.removeItem(
                  localDraftKey(activeTaskId, viewer.id),
                );
                setLocalRecovery(null);
                pendingRecoveryRef.current = false;
                showNotice('已保留当前服务器内容。');
              }}
            >
              不恢复
            </button>
          </div>
        </section>
      ) : null}

      <section
        className="r26-progress-context"
        aria-label="当前进展上下文"
      >
        <div className="r26-progress-context__identity">
          <span
            className="r26-color-swatch r26-real-color"
            aria-hidden="true"
          />
          <div>
            <span>
              {task.project.colorName} · {task.project.name}
            </span>
            <strong>
              第 {String(task.stepNumber).padStart(2, '0')} 步 ·{' '}
              {task.stepName}
            </strong>
          </div>
        </div>
        <div className="r26-progress-context__facts">
          <span>提交人：{viewer.name}</span>
          <span>负责人：{task.owner?.name ?? '尚未分配'}</span>
          <span>截止：{formatDateTime(task.schedule.effectiveDueAt)}</span>
          <StatusPill tone={task.schedule.isOverdue ? 'risk' : 'current'}>
            {task.statusLabel}
          </StatusPill>
        </div>
      </section>

      {!canSubmit ? (
        <section className="r26-gate3b-permission-note" role="alert">
          <strong>当前账号只有查看权限</strong>
          <p>
            进展与材料动作由后端 availableActions 判定，观察者不能通过修改
            taskId 绕过。
          </p>
        </section>
      ) : null}

      <nav className="r26-progress-steps" aria-label="进展提交步骤">
        {STEPS.map((item) => (
          <button
            key={item.number}
            type="button"
            className={
              step === item.number
                ? 'is-current'
                : step > item.number
                  ? 'is-complete'
                  : undefined
            }
            aria-current={step === item.number ? 'step' : undefined}
            onClick={() => {
              if (item.number <= step || validateStep(item.number - 1)) {
                setStep(item.number);
              }
            }}
          >
            <span>{step > item.number ? <CheckIcon /> : item.number}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </div>
          </button>
        ))}
      </nav>

      <section className="r26-progress-panel">
        {step === 1 ? (
          <div className="r26-form-section" data-testid="progress-step-1">
            <div className="r26-form-section__heading">
              <span>1</span>
              <div>
                <h2>本次做了什么</h2>
                <p>只填写本次进展，不重复选择项目、工序或本人。</p>
              </div>
            </div>
            <fieldset className="r26-progress-status">
              <legend>本次进展状态</legend>
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={
                    form.progressStatus === option.value
                      ? option.value === 'BLOCKED'
                        ? 'is-selected is-risk'
                        : 'is-selected'
                      : undefined
                  }
                >
                  <input
                    type="radio"
                    name="progressStatus"
                    value={option.value}
                    checked={form.progressStatus === option.value}
                    onChange={() =>
                      updateForm({ progressStatus: option.value })
                    }
                  />
                  <span aria-hidden="true">
                    {form.progressStatus === option.value ? '✓' : ''}
                  </span>
                  <div>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </div>
                </label>
              ))}
            </fieldset>
            {form.progressStatus ===
            'WORK_COMPLETE_PENDING_TASK_COMPLETION' ? (
              <div className="r26-work-complete-note">
                <strong>“本次工作已完成”不会完成工序</strong>
                <span>
                  工序仍需通过后续“完成工序”操作正式推进，Gate 3B
                  尚未开放该能力。
                </span>
              </div>
            ) : null}
            <label className="r26-field">
              <span>本次完成内容</span>
              <textarea
                rows={6}
                maxLength={4000}
                value={form.completedWork}
                onChange={(event) =>
                  updateForm({ completedWork: event.target.value })
                }
                placeholder="写明完成了什么、数量或结果，以及可追溯事实"
              />
              <small>{form.completedWork.length} / 4000</small>
            </label>
            <label className="r26-field">
              <span>下一步计划</span>
              <textarea
                rows={4}
                maxLength={2000}
                value={form.nextPlan}
                onChange={(event) =>
                  updateForm({ nextPlan: event.target.value })
                }
                placeholder="说明接下来做什么，以及预计何时完成"
              />
              <small>{form.nextPlan.length} / 2000</small>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="r26-form-section" data-testid="progress-step-2">
            <div className="r26-form-section__heading">
              <span>2</span>
              <div>
                <h2>是否存在阻塞</h2>
                <p>只有选择“遇到阻塞”时才需要补充协助信息。</p>
              </div>
            </div>
            <div
              className="r26-choice-grid"
              role="radiogroup"
              aria-label="阻塞状态"
            >
              <label
                className={
                  form.progressStatus !== 'BLOCKED'
                    ? 'is-selected'
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="blocked"
                  checked={form.progressStatus !== 'BLOCKED'}
                  onChange={() =>
                    updateForm({ progressStatus: 'IN_PROGRESS' })
                  }
                />
                <span>
                  <CheckIcon />
                </span>
                <div>
                  <strong>没有阻塞</strong>
                  <small>可以按计划继续当前工序</small>
                </div>
              </label>
              <label
                className={
                  form.progressStatus === 'BLOCKED'
                    ? 'is-selected is-risk'
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="blocked"
                  checked={form.progressStatus === 'BLOCKED'}
                  onChange={() => updateForm({ progressStatus: 'BLOCKED' })}
                />
                <span>!</span>
                <div>
                  <strong>存在阻塞</strong>
                  <small>需要人员或部门介入</small>
                </div>
              </label>
            </div>

            {form.progressStatus === 'BLOCKED' ? (
              <div
                className="r26-blocker-fields"
                data-testid="blocker-fields"
              >
                <label className="r26-field">
                  <span>阻塞类型</span>
                  <select
                    value={form.blockerType}
                    onChange={(event) =>
                      updateForm({ blockerType: event.target.value })
                    }
                  >
                    <option value="WAITING_MATERIAL">等待材料</option>
                    <option value="WAITING_CONFIRMATION">等待确认</option>
                    <option value="SUPPLIER">供应商问题</option>
                    <option value="COLLABORATION">人员协作</option>
                    <option value="EQUIPMENT">设备问题</option>
                    <option value="OTHER">其他</option>
                  </select>
                </label>
                <label className="r26-field">
                  <span>影响程度</span>
                  <select
                    value={form.impactLevel}
                    onChange={(event) =>
                      updateForm({ impactLevel: event.target.value })
                    }
                  >
                    <option value="NO_DEADLINE_IMPACT">
                      不影响截止时间
                    </option>
                    <option value="MAY_DELAY">可能导致延期</option>
                    <option value="ALREADY_DELAYED">已经导致延期</option>
                  </select>
                </label>
                <label className="r26-field r26-field--wide">
                  <span>阻塞说明</span>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={form.blockerDescription}
                    onChange={(event) =>
                      updateForm({
                        blockerDescription: event.target.value,
                      })
                    }
                    placeholder="说明发生了什么、影响什么，以及需要什么决定"
                  />
                </label>
                <div className="r26-assistance-picker r26-field--wide">
                  <span>需要谁协助</span>
                  <div>
                    {data.assistanceOptions.users.map((person) => (
                      <label key={person.id}>
                        <input
                          type="checkbox"
                          checked={form.assistanceUserIds.includes(
                            person.id,
                          )}
                          onChange={() =>
                            updateForm({
                              assistanceUserIds: toggleId(
                                form.assistanceUserIds,
                                person.id,
                              ),
                            })
                          }
                        />
                        <span>
                          {person.name}
                          <small>
                            {person.departmentName ?? '部门待同步'}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div>
                    {data.assistanceOptions.departments.map((department) => (
                      <label key={department.id}>
                        <input
                          type="checkbox"
                          checked={form.assistanceDepartmentIds.includes(
                            department.id,
                          )}
                          onChange={() =>
                            updateForm({
                              assistanceDepartmentIds: toggleId(
                                form.assistanceDepartmentIds,
                                department.id,
                              ),
                            })
                          }
                        />
                        <span>{department.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="r26-field r26-field--wide">
                  <span>预计解除时间</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="例如：2026-07-28 10:00"
                    maxLength={16}
                    value={form.expectedResolvedAt}
                    onChange={(event) =>
                      updateForm({
                        expectedResolvedAt: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="r26-clear-state">
                <CheckIcon />
                <span>当前无阻塞，可以继续补齐材料并提交。</span>
              </div>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div
            id="materials"
            className="r26-form-section"
            data-testid="progress-step-3"
          >
            <div className="r26-form-section__heading">
              <span>3</span>
              <div>
                <h2>上传证明材料</h2>
                <p>
                  文件会经过扩展名、MIME、魔数、大小、路径与权限校验。
                </p>
              </div>
            </div>

            <div className="r26-required-materials">
              <div className="r26-material-heading">
                <h3>本工序材料</h3>
                <strong>
                  {data.materials.summary.submitted} /{' '}
                  {data.materials.summary.required}
                </strong>
              </div>
              {data.materials.requirements.length ? (
                <ul>
                  {data.materials.requirements.map((requirement) => (
                    <li
                      key={requirement.id}
                      className={
                        requirement.status === 'SUBMITTED'
                          ? 'is-complete'
                          : 'is-missing'
                      }
                    >
                      {requirement.status === 'SUBMITTED' ? (
                        <CheckIcon />
                      ) : (
                        <span>!</span>
                      )}
                      <span>
                        <strong>{requirement.name}</strong>
                        <small>
                          {requirement.currentAttachment
                            ? `V${requirement.currentAttachment.versionNo} · ${requirement.currentAttachment.fileName}`
                            : '待补充'}
                        </small>
                      </span>
                      {requirement.currentAttachment ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMaterialType(requirement.id);
                            setReplaceAttachmentId(
                              requirement.currentAttachment!.id,
                            );
                            fileInputRef.current?.click();
                          }}
                        >
                          替换版本
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMaterialType(requirement.id);
                            setReplaceAttachmentId(null);
                            fileInputRef.current?.click();
                          }}
                        >
                          上传
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>当前工序未配置必交材料，可以上传一份工作证明。</p>
              )}
            </div>

            <div
              className="r26-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              data-testid="progress-dropzone"
            >
              <UploadIcon />
              <strong>
                {selectedFile
                  ? replaceAttachmentId
                    ? '已选择替换版本'
                    : '已选择新材料'
                  : '拖入材料，或从本机选择'}
              </strong>
              <p>
                {selectedFile?.name ??
                  '支持 PDF、PNG、JPG、DOCX、XLSX，单个文件不超过 20MB。'}
              </p>
              <div className="r26-upload-actions">
                <button
                  type="button"
                  className="r26-button r26-button--secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </button>
                {selectedFile ? (
                  <button
                    type="button"
                    className="r26-button r26-button--primary"
                    disabled={pendingAction === 'upload'}
                    onClick={uploadMaterial}
                  >
                    {pendingAction === 'upload'
                      ? '正在安全上传…'
                      : replaceAttachmentId
                        ? '上传为新版本'
                        : '上传材料'}
                  </button>
                ) : null}
                {pendingAction === 'upload' ? (
                  <button
                    type="button"
                    className="r26-button r26-button--ghost"
                    onClick={() => uploadControllerRef.current?.abort()}
                  >
                    取消上传
                  </button>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />
            </div>

            {data.materials.versions.length ? (
              <div className="r26-material-history">
                <h3>材料版本历史</h3>
                <ul>
                  {data.materials.versions.map((version) => (
                    <li key={version.id}>
                      <div>
                        <strong>{version.fileName}</strong>
                        <span>
                          V{version.versionNo} ·{' '}
                          {version.uploadedByName ?? '系统'} ·{' '}
                          {formatDateTime(version.uploadedAt)}
                        </span>
                      </div>
                      <StatusPill
                        tone={version.isCurrent ? 'completed' : 'neutral'}
                      >
                        {version.isCurrent ? '当前版本' : '历史版本'}
                      </StatusPill>
                      {version.isCurrent ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMaterialType(
                              version.materialType ?? 'WORK_EVIDENCE',
                            );
                            setReplaceAttachmentId(version.id);
                            fileInputRef.current?.click();
                          }}
                        >
                          替换版本
                        </button>
                      ) : null}
                      <a
                        href={`${API_BASE_URL}${version.downloadUrl}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="r26-submit-summary">
              <h3>提交摘要</h3>
              <dl>
                <div>
                  <dt>本次状态</dt>
                  <dd>{progressStatusLabel(form.progressStatus)}</dd>
                </div>
                <div>
                  <dt>阻塞</dt>
                  <dd>
                    {form.progressStatus === 'BLOCKED'
                      ? '已申报，等待协助'
                      : '无阻塞'}
                  </dd>
                </div>
                <div>
                  <dt>当前材料</dt>
                  <dd>{activeAttachmentIds.length} 份</dd>
                </div>
                <div>
                  <dt>流程推进</dt>
                  <dd>不会发生</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}
      </section>

      {actionError ? (
        <div className="r26-form-error" role="alert">
          {actionError}
        </div>
      ) : null}

      <section className="r26-progress-history">
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">不可覆盖的事实</p>
            <h2>本工序进展历史</h2>
          </div>
          <span>{data.progressHistory.length} 条记录</span>
        </div>
        {data.progressHistory.length ? (
          <ol>
            {data.progressHistory.map((history) => (
              <li key={history.id}>
                <time>{formatDateTime(history.createdAt)}</time>
                <div>
                  <strong>{history.completedWork}</strong>
                  <p>{history.nextPlan ?? '未填写下一步计划'}</p>
                  <span>
                    {history.submittedBy?.name ?? '系统用户'} ·{' '}
                    {progressStatusLabel(history.progressStatus)}
                  </span>
                  {history.blocker ? (
                    <small>
                      阻塞：{history.blocker.description} · 预计{' '}
                      {formatDateTime(
                        history.blocker.expectedResolvedAt,
                      )}{' '}
                      解除
                    </small>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>当前工序还没有正式进展记录。</p>
        )}
      </section>

      <footer className="r26-progress-footer">
        <div className="r26-draft-actions">
          <button
            type="button"
            className="r26-button r26-button--ghost"
            disabled={!canSubmit || pendingAction !== null}
            onClick={saveDraft}
          >
            {pendingAction === 'draft' ? '正在保存…' : '保存草稿'}
          </button>
          <button
            type="button"
            className="r26-delete-draft"
            disabled={
              !canSubmit ||
              pendingAction !== null ||
              (draftVersion === 0 &&
                !form.completedWork.trim() &&
                !form.nextPlan.trim() &&
                !form.blockerDescription.trim() &&
                form.assistanceUserIds.length === 0 &&
                form.assistanceDepartmentIds.length === 0 &&
                !form.expectedResolvedAt)
            }
            onClick={deleteDraft}
          >
            删除草稿
          </button>
          <span>
            {draftVersion > 0
              ? `服务器草稿 V${draftVersion}`
              : '未保存服务器草稿'}
          </span>
        </div>
        <div>
          {step > 1 ? (
            <button
              type="button"
              className="r26-button r26-button--secondary"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeftIcon />
              上一步
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              className="r26-button r26-button--primary"
              disabled={!canSubmit}
              onClick={goNext}
              data-testid="progress-next"
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="r26-button r26-button--primary"
              disabled={!canSubmit || pendingAction !== null}
              onClick={submitProgress}
              data-testid="progress-submit"
            >
              {pendingAction === 'submit'
                ? '正在提交…'
                : '提交本次进展'}
            </button>
          )}
        </div>
      </footer>

      {notice ? (
        <div className="r26-toast" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setNotice(null)}
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function toCommandFields(form: FormState) {
  const blocked = form.progressStatus === 'BLOCKED';
  return {
    progressStatus: form.progressStatus,
    completedWork: form.completedWork,
    nextPlan: form.nextPlan,
    ...(blocked
      ? {
          blockerType: form.blockerType,
          blockerDescription: form.blockerDescription,
          assistanceUserIds: form.assistanceUserIds,
          assistanceDepartmentIds: form.assistanceDepartmentIds,
          ...(form.expectedResolvedAt
            ? {
                expectedResolvedAt:
                  parseLocalDateTime(
                    form.expectedResolvedAt,
                  )?.toISOString() ?? form.expectedResolvedAt,
              }
            : {}),
          impactLevel: form.impactLevel,
        }
      : {}),
  };
}

function toggleId(values: string[], id: string) {
  return values.includes(id)
    ? values.filter((value) => value !== id)
    : [...values, id];
}

function localDraftKey(taskId: string, userId: string) {
  return `r26-g3b-progress-local:${userId}:${taskId}`;
}

function readLocalDraft(
  taskId: string,
  userId: string,
): FormState | null {
  try {
    const raw = window.localStorage.getItem(
      localDraftKey(taskId, userId),
    );
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FormState>;
    if (
      !value.progressStatus ||
      !STATUS_OPTIONS.some(
        (option) => option.value === value.progressStatus,
      )
    ) {
      return null;
    }
    return {
      ...EMPTY_FORM,
      ...value,
      assistanceUserIds: Array.isArray(value.assistanceUserIds)
        ? value.assistanceUserIds
        : [],
      assistanceDepartmentIds: Array.isArray(
        value.assistanceDepartmentIds,
      )
        ? value.assistanceDepartmentIds
        : [],
    };
  } catch {
    return null;
  }
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

function parseLocalDateTime(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/u.exec(
      value.trim(),
    );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day) &&
    date.getHours() === Number(hour) &&
    date.getMinutes() === Number(minute)
    ? date
    : null;
}

function progressStatusLabel(value: R26ProgressStatus) {
  return (
    STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return '待确定';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
