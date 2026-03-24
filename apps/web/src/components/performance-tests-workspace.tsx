'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import { useAuth } from './auth-provider';
import {
  canManagePerformanceTests,
  canShowCompletePerformanceTestTaskButton,
  completePerformanceTestTask,
  createPerformanceTest,
  fetchPerformanceTestDetail,
  fetchPerformanceTestPageOptions,
  fetchPerformanceTestsWorkspace,
  getDefaultTesterId,
  getPerformanceTestItemLabel,
  getPerformanceTestResultLabel,
  getPerformanceTestStatusLabel,
  getPerformanceTestWorkspaceHighlights,
  submitPerformanceTest,
  updatePerformanceTest,
  uploadPerformanceTestReport,
  validatePerformanceTestForm,
  PERFORMANCE_TEST_ITEM_OPTIONS,
  PERFORMANCE_TEST_RESULT_OPTIONS,
  type PerformanceTestDetail,
  type PerformanceTestFormInput,
  type PerformanceTestRecord,
  type PerformanceTestsWorkspaceResponse,
} from '../lib/performance-tests-client';
import { type DirectoryUser, formatDate } from '../lib/projects-client';
import {
  isWorkflowTaskOverdue,
} from '../lib/workflows-client';

type PerformanceTestsWorkspaceProps = {
  projectId: string;
};

const EMPTY_FORM: PerformanceTestFormInput = {
  testCode: '',
  sampleId: '',
  relatedObjectName: '',
  testItem: 'ADHESION',
  standardValue: '',
  actualValue: '',
  result: 'PASS',
  conclusion: '',
  testedById: '',
  testedAt: '',
};

export function PerformanceTestsWorkspace({
  projectId,
}: PerformanceTestsWorkspaceProps) {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const [workspace, setWorkspace] = useState<PerformanceTestsWorkspaceResponse | null>(null);
  const [testerOptions, setTesterOptions] = useState<DirectoryUser[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PerformanceTestDetail | null>(null);
  const [form, setForm] = useState<PerformanceTestFormInput>(EMPTY_FORM);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
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
      setSelectedTestId(null);
      setSelectedDetail(null);
      return;
    }

    const nextTestId = selectedTestId ?? workspace.items[0]?.id ?? null;

    if (nextTestId && nextTestId !== selectedTestId) {
      setSelectedTestId(nextTestId);
    }
  }, [workspace, selectedTestId]);

  useEffect(() => {
    if (!selectedTestId) {
      setSelectedDetail(null);
      return;
    }

    let cancelled = false;

    void fetchPerformanceTestDetail(projectId, selectedTestId)
      .then((detail) => {
        if (!cancelled) {
          setSelectedDetail(detail);
        }
      })
      .catch((detailError) => {
        if (!cancelled) {
          setError(
            detailError instanceof Error ? detailError.message : '试验详情加载失败。',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedTestId]);

  const canManage = canManagePerformanceTests(user);
  const highlights = workspace ? getPerformanceTestWorkspaceHighlights(workspace) : null;
  const isReadOnly = !workspace?.activeTask;
  const sampleOptions = workspace?.sampleOptions ?? [];

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
        fetchPerformanceTestsWorkspace(projectId),
        fetchPerformanceTestPageOptions(),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setWorkspace(workspaceResponse);
      setTesterOptions(users);
      setForm((current) => ({
        ...current,
        testedById: current.testedById || getDefaultTesterId(users, user?.id ?? null),
        sampleId:
          current.sampleId &&
          workspaceResponse.sampleOptions.some((item) => item.id === current.sampleId)
            ? current.sampleId
            : current.sampleId,
      }));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '性能试验工作区加载失败。');
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function handleSave() {
    const validationMessage = validatePerformanceTestForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = editingTestId
        ? await updatePerformanceTest(projectId, editingTestId, form)
        : await createPerformanceTest(projectId, form);

      setWorkspace(nextWorkspace);
      setSuccessMessage(editingTestId ? '试验记录已更新。' : '试验记录已创建。');
      setEditingTestId(null);
      setForm({
        ...EMPTY_FORM,
        testedById: getDefaultTesterId(testerOptions, user?.id ?? null),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '试验记录保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmitTest(test: PerformanceTestRecord) {
    setActingKey(`submit:${test.id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await submitPerformanceTest(projectId, test.id);
      setWorkspace(nextWorkspace);
      setSuccessMessage(`试验记录 ${test.testCode} 已提交。`);
      if (selectedTestId === test.id) {
        const detail = await fetchPerformanceTestDetail(projectId, test.id);
        setSelectedDetail(detail);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '试验记录提交失败。');
    } finally {
      setActingKey(null);
    }
  }

  async function handleUploadReport(test: PerformanceTestRecord, file: File) {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const detail = await uploadPerformanceTestReport(projectId, test.id, file);
      setSelectedDetail(detail);
      await loadWorkspace();
      setSuccessMessage(`试验记录 ${test.testCode} 已上传报告附件。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '报告上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCompleteTask() {
    setActingKey('complete-task');
    setError(null);
    setSuccessMessage(null);

    try {
      const nextWorkspace = await completePerformanceTestTask(projectId);
      setWorkspace(nextWorkspace);
      setSuccessMessage('涂料性能试验节点已完成。');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : '节点完成失败。');
    } finally {
      setActingKey(null);
    }
  }

  function prepareEdit(test: PerformanceTestRecord) {
    setEditingTestId(test.id);
    setSelectedTestId(test.id);
    setForm({
      testCode: test.testCode,
      sampleId: test.sampleId ?? '',
      relatedObjectName: test.relatedObjectName ?? '',
      testItem: test.testItem,
      standardValue: test.standardValue ?? '',
      actualValue: test.actualValue ?? '',
      result: test.result ?? 'PASS',
      conclusion: test.conclusion ?? '',
      testedById: test.testedById ?? '',
      testedAt: toDateTimeLocalValue(test.testedAt),
    });
  }

  function resetForm() {
    setEditingTestId(null);
    setForm({
      ...EMPTY_FORM,
      testedById: getDefaultTesterId(testerOptions, user?.id ?? null),
    });
  }

  if (isLoading || !workspace || !highlights) {
    return (
      <section className="page-card">
        <p className="eyebrow">Performance Tests</p>
        <h1>正在加载性能试验模块…</h1>
        <p>试验记录、报告附件和任务状态正在同步。</p>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Performance Tests</p>
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
          </div>
        </div>
        <div className="metadata-grid">
          <div className="metadata-item">
            <span>采购完成状态</span>
            <strong>{workspace.procurementCompleted ? '已完成' : '未完成'}</strong>
          </div>
          <div className="metadata-item">
            <span>试验任务状态</span>
            <strong>{highlights.activeTaskStatusLabel}</strong>
          </div>
          <div className="metadata-item">
            <span>节点负责人</span>
            <strong>{workspace.activeTask?.assigneeUserName ?? '未分配'}</strong>
          </div>
          <div className="metadata-item">
            <span>已提交记录</span>
            <strong>{workspace.statistics.submittedCount}</strong>
          </div>
        </div>
        {workspace.activeTask && isWorkflowTaskOverdue(workspace.activeTask) ? (
          <p className="error-text">当前涂料性能试验任务已超期。</p>
        ) : null}
        {!workspace.procurementCompleted ? (
          <p className="muted">采购节点完成后才会激活性能试验任务。</p>
        ) : null}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Node Completion</p>
            <h2 className="section-title">性能试验节点完成</h2>
            <p className="muted">至少存在一条已提交且有结论的试验记录后，才允许完成当前节点。</p>
          </div>
        </div>
        {workspace.completionIssue ? <p className="muted">{workspace.completionIssue}</p> : null}
        <CompletePerformanceTestTaskButton
          disabled={
            actingKey === 'complete-task' ||
            !canShowCompletePerformanceTestTaskButton(user, workspace)
          }
          onClick={() => void handleCompleteTask()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Test Form</p>
            <h2 className="section-title">试验结果录入</h2>
            <p className="muted">支持多条试验项目记录，提交后锁定为只读。</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="button button-secondary" onClick={resetForm}>
              重置表单
            </button>
          </div>
        </div>
        <TestResultForm
          value={form}
          sampleOptions={sampleOptions}
          testerOptions={testerOptions}
          disabled={!canManage || isReadOnly || isSaving}
          submitLabel={editingTestId ? '更新试验记录' : '新建试验记录'}
          onChange={setForm}
          onSubmit={() => void handleSave()}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Test Records</p>
            <h2 className="section-title">试验记录列表</h2>
            <p className="muted">列表展示试验项目、结论和报告状态，操作完成后会自动刷新。</p>
          </div>
        </div>
        <TestItemTable
          items={workspace.items}
          selectedTestId={selectedTestId}
          canManage={canManage}
          isReadOnly={isReadOnly}
          actingKey={actingKey}
          onSelect={setSelectedTestId}
          onEdit={prepareEdit}
          onSubmitRecord={(test) => void handleSubmitTest(test)}
        />
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Test Detail</p>
            <h2 className="section-title">试验详情与报告附件</h2>
            <p className="muted">支持查看详情、报告附件和附件历史。</p>
          </div>
          {selectedDetail ? (
            <div className="inline-actions">
              <Link
                href={`/projects/${projectId}/attachments?entityType=PERFORMANCE_TEST&entityId=${selectedDetail.id}`}
                className="button button-secondary"
              >
                查看附件中心
              </Link>
            </div>
          ) : null}
        </div>
        <TestConclusionCard detail={selectedDetail} />
        {selectedDetail ? (
          <TestAttachmentUploader
            disabled={!canManage || isReadOnly || selectedDetail.status !== 'DRAFT' || isUploading}
            detail={selectedDetail}
            onUpload={(file) => {
              const record = workspace.items.find((item) => item.id === selectedDetail.id);

              if (record) {
                void handleUploadReport(record, file);
              }
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

export function TestResultForm({
  value,
  sampleOptions,
  testerOptions,
  disabled,
  submitLabel,
  onChange,
  onSubmit,
}: {
  value: PerformanceTestFormInput;
  sampleOptions: PerformanceTestsWorkspaceResponse['sampleOptions'];
  testerOptions: DirectoryUser[];
  disabled: boolean;
  submitLabel: string;
  onChange: (nextValue: PerformanceTestFormInput) => void;
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
        <span>试验编码</span>
        <input
          required
          disabled={disabled}
          value={value.testCode}
          onChange={(event) => onChange({ ...value, testCode: event.target.value })}
        />
      </label>
      <label className="field">
        <span>关联样板</span>
        <select
          disabled={disabled}
          value={value.sampleId}
          onChange={(event) => onChange({ ...value, sampleId: event.target.value })}
        >
          <option value="">未绑定样板</option>
          {sampleOptions.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.sampleNo} / {sample.sampleName} / V{sample.versionNo}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>关联对象</span>
        <input
          disabled={disabled}
          value={value.relatedObjectName}
          onChange={(event) =>
            onChange({ ...value, relatedObjectName: event.target.value })
          }
        />
      </label>
      <label className="field">
        <span>试验项目</span>
        <select
          disabled={disabled}
          value={value.testItem}
          onChange={(event) =>
            onChange({
              ...value,
              testItem: event.target.value as PerformanceTestFormInput['testItem'],
            })
          }
        >
          {PERFORMANCE_TEST_ITEM_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>标准值</span>
        <input
          required
          disabled={disabled}
          value={value.standardValue}
          onChange={(event) => onChange({ ...value, standardValue: event.target.value })}
        />
      </label>
      <label className="field">
        <span>实测值</span>
        <input
          required
          disabled={disabled}
          value={value.actualValue}
          onChange={(event) => onChange({ ...value, actualValue: event.target.value })}
        />
      </label>
      <label className="field">
        <span>结果</span>
        <select
          disabled={disabled}
          value={value.result}
          onChange={(event) =>
            onChange({
              ...value,
              result: event.target.value as PerformanceTestFormInput['result'],
            })
          }
        >
          {PERFORMANCE_TEST_RESULT_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>试验人</span>
        <select
          disabled={disabled}
          value={value.testedById}
          onChange={(event) => onChange({ ...value, testedById: event.target.value })}
        >
          <option value="">请选择试验人</option>
          {testerOptions.map((tester) => (
            <option key={tester.id} value={tester.id}>
              {tester.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>试验时间</span>
        <input
          required
          type="datetime-local"
          disabled={disabled}
          value={value.testedAt}
          onChange={(event) => onChange({ ...value, testedAt: event.target.value })}
        />
      </label>
      <label className="field field-full">
        <span>试验结论</span>
        <textarea
          rows={4}
          disabled={disabled}
          value={value.conclusion}
          onChange={(event) => onChange({ ...value, conclusion: event.target.value })}
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

export function TestItemTable({
  items,
  selectedTestId,
  canManage,
  isReadOnly,
  actingKey,
  onSelect,
  onEdit,
  onSubmitRecord,
}: {
  items: PerformanceTestRecord[];
  selectedTestId: string | null;
  canManage: boolean;
  isReadOnly: boolean;
  actingKey: string | null;
  onSelect: (testId: string) => void;
  onEdit: (test: PerformanceTestRecord) => void;
  onSubmitRecord: (test: PerformanceTestRecord) => void;
}) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>试验编码</th>
            <th>项目</th>
            <th>样板/对象</th>
            <th>结果</th>
            <th>结论</th>
            <th>报告</th>
            <th>状态</th>
            <th>动作</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <strong>暂无性能试验记录</strong>
                  <p>采购节点完成后，可在这里录入涂料性能试验。</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className={selectedTestId === item.id ? 'row-selected' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <td>{item.testCode}</td>
                <td>{getPerformanceTestItemLabel(item.testItem)}</td>
                <td>
                  {item.sample
                    ? `${item.sample.sampleNo} / ${item.sample.sampleName}`
                    : item.relatedObjectName ?? '未绑定'}
                </td>
                <td>{getPerformanceTestResultLabel(item.result)}</td>
                <td>{item.conclusion ?? '未填写'}</td>
                <td>{item.reportAttachment ? item.reportAttachment.fileName : '未上传'}</td>
                <td>{getPerformanceTestStatusLabel(item.status)}</td>
                <td>
                  <div className="task-actions">
                    {canManage && !isReadOnly && item.status === 'DRAFT' ? (
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
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={actingKey === `submit:${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSubmitRecord(item);
                          }}
                        >
                          {actingKey === `submit:${item.id}` ? '处理中…' : '提交'}
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

export function TestConclusionCard({
  detail,
}: {
  detail: PerformanceTestDetail | null;
}) {
  if (!detail) {
    return (
      <div className="empty-state">
        <strong>请选择一条试验记录</strong>
        <p>右侧会展示详细结果、结论和附件记录。</p>
      </div>
    );
  }

  return (
    <div className="detail-grid">
      <div className="detail-item">
        <span>试验编码</span>
        <strong>{detail.testCode}</strong>
      </div>
      <div className="detail-item">
        <span>试验项目</span>
        <strong>{getPerformanceTestItemLabel(detail.testItem)}</strong>
      </div>
      <div className="detail-item">
        <span>试验人</span>
        <strong>{detail.testedByName ?? '未填写'}</strong>
      </div>
      <div className="detail-item">
        <span>试验时间</span>
        <strong>{formatDate(detail.testedAt)}</strong>
      </div>
      <div className="detail-item">
        <span>标准值</span>
        <strong>{detail.standardValue ?? '未填写'}</strong>
      </div>
      <div className="detail-item">
        <span>实测值</span>
        <strong>{detail.actualValue ?? '未填写'}</strong>
      </div>
      <div className="detail-item">
        <span>结果</span>
        <strong>{getPerformanceTestResultLabel(detail.result)}</strong>
      </div>
      <div className="detail-item">
        <span>状态</span>
        <strong>{getPerformanceTestStatusLabel(detail.status)}</strong>
      </div>
      <div className="detail-item detail-item-full">
        <span>结论</span>
        <strong>{detail.conclusion ?? '未填写'}</strong>
      </div>
      <div className="detail-item detail-item-full">
        <span>报告附件</span>
        <strong>
          {detail.reportAttachment ? (
            <a href={detail.reportAttachment.contentUrl} target="_blank" rel="noreferrer">
              {detail.reportAttachment.fileName}
            </a>
          ) : (
            '未上传'
          )}
        </strong>
      </div>
    </div>
  );
}

export function TestAttachmentUploader({
  detail,
  disabled,
  onUpload,
}: {
  detail: PerformanceTestDetail;
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="page-stack">
      <div className="inline-actions">
        <label className="button button-secondary upload-button">
          {disabled ? '不可上传' : '上传报告附件'}
          <input
            type="file"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onUpload(file);
              }

              event.target.value = '';
            }}
          />
        </label>
      </div>
      {detail.attachmentHistory.length > 0 ? (
        <div className="detail-grid">
          {detail.attachmentHistory.map((attachment) => (
            <div key={attachment.id} className="detail-item">
              <span>{formatDate(attachment.createdAt)}</span>
              <strong>
                <a href={attachment.contentUrl} target="_blank" rel="noreferrer">
                  {attachment.fileName}
                </a>
              </strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CompletePerformanceTestTaskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="button" disabled={disabled} onClick={onClick}>
      完成性能试验节点
    </button>
  );
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
