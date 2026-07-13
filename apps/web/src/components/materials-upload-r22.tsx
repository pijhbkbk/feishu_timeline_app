'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { formatAttachmentSize, uploadProjectAttachment } from '../lib/attachments-client';
import { API_BASE_URL } from '../lib/auth-client';
import { fetchTaskDetail, fetchTaskList, type TaskListItem } from '../lib/tasks-client';
import {
  fetchWorkflowTaskInteractionDetail,
  type WorkflowTaskInteractionDetail,
} from '../lib/workflows-client';
import { R22Card, R22StatusBadge } from './r22-ui';

export function MaterialsUploadR22() {
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get('taskId');
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [taskId, setTaskId] = useState(requestedTaskId ?? '');
  const [detail, setDetail] = useState<WorkflowTaskInteractionDetail | null>(null);
  const [materialType, setMaterialType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { void loadTasks(); }, []);
  useEffect(() => { if (taskId) void loadDetail(taskId); }, [taskId]);

  async function loadTasks() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchTaskList('my', { page: 1, pageSize: 100 });
      let nextTasks = response.items;
      if (requestedTaskId && !nextTasks.some((item) => item.taskId === requestedTaskId)) {
        try {
          nextTasks = [await fetchTaskDetail(requestedTaskId), ...nextTasks];
        } catch {
          // The detail request below will surface the permission or missing-task error.
        }
      }
      setTasks(nextTasks);
      setTaskId((current) => current || nextTasks[0]?.taskId || '');
      if (nextTasks.length === 0) setIsLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '任务上下文加载失败。');
      setIsLoading(false);
    }
  }

  async function loadDetail(nextTaskId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchWorkflowTaskInteractionDetail(nextTaskId);
      setDetail(next);
      setMaterialType((current) => current || next.requiredMaterials[0]?.id || next.outputName);
    } catch (loadError) {
      setDetail(null);
      setError(loadError instanceof Error ? loadError.message : '材料要求加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function upload() {
    if (!detail || !file) {
      setError('请先选择材料文件。');
      return;
    }
    setIsUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadProjectAttachment(detail.projectId, file, {
        entityType: 'WORKFLOW_TASK',
        entityId: detail.taskId,
        materialType: inferredMaterialName,
        ...(replacingId ? { replacesAttachmentId: replacingId } : {}),
      });
      await loadDetail(detail.taskId);
      setFile(null);
      setReplacingId(null);
      setSuccess(replacingId ? '新版本已上传，旧版本已安全归档。' : '材料已上传并绑定到当前工序。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '材料上传失败。');
    } finally {
      setIsUploading(false);
    }
  }

  function chooseReplacement(attachmentId: string) {
    setReplacingId(attachmentId);
    setFile(null);
    setSuccess(null);
    document.getElementById('r22-material-file')?.focus();
  }

  const selectedTask = tasks.find((item) => item.taskId === taskId) ?? null;
  const inferredMaterialName = detail?.requiredMaterials.find((item) => item.id === materialType)?.name ?? detail?.outputName ?? '工序材料';
  const versions = useMemo(() => buildVersions(detail?.attachments ?? []), [detail?.attachments]);

  return (
    <div className="r22-page r22-materials-page" data-testid="materials-upload-page">
      <header className="r22-page-hero r22-progress-hero">
        <div><p className="r22-overline">进展材料</p><h1>上传工序材料</h1><p>项目、节点和材料要求来自真实任务；文件仍通过 R19B 安全校验链路。</p></div>
        <label className="r22-task-picker"><span>当前任务</span><select value={taskId} onChange={(event) => { setMaterialType(''); setTaskId(event.target.value); }} disabled={tasks.length === 0}><option value="">请选择任务</option>{tasks.map((task) => <option key={task.taskId} value={task.taskId}>{task.projectName} · {task.nodeName}</option>)}</select></label>
      </header>

      {error ? <div className="r22-inline-alert"><span>{error}</span><button type="button" onClick={() => taskId && void loadDetail(taskId)}>重试</button></div> : null}
      {success ? <div className="r22-inline-success" role="status">{success}</div> : null}
      {isLoading ? <div className="r22-card r22-skeleton-card" aria-label="正在加载材料要求" /> : null}
      {!isLoading && tasks.length === 0 ? <R22Card className="r22-empty-focus"><span className="r22-empty-icon">✓</span><h2>没有可上传材料的任务</h2><p>任务分配后会自动出现在这里。</p><Link href="/tasks" className="r22-button r22-button-secondary">返回我的任务</Link></R22Card> : null}

      {detail ? (
        <>
          <section className="r22-material-context" aria-label="任务上下文">
            <div><span>项目</span><strong>{selectedTask?.projectName ?? detail.projectId}</strong></div>
            <div><span>当前节点</span><strong>{detail.stepNumber}. {detail.stepName}</strong></div>
            <div><span>材料类型</span><strong>{inferredMaterialName}</strong></div>
            <div><span>责任人</span><strong>{detail.owner?.name ?? '待分配'}</strong></div>
          </section>

          <section className="r22-material-upload-grid">
            <R22Card className="r22-required-materials">
              <div className="r22-section-heading"><div><p className="r22-overline">Required</p><h2>本工序材料清单</h2><p>材料要求由流程节点配置自动带入。</p></div></div>
              {detail.requiredMaterials.length ? <ul>{detail.requiredMaterials.map((item) => { const submitted = detail.attachments.some((attachment) => attachment.materialType === item.id || attachment.materialType === item.name); return <li key={item.id}><span className={submitted ? 'is-done' : ''}>{submitted ? '✓' : '○'}</span><button type="button" className={materialType === item.id ? 'is-selected' : undefined} onClick={() => setMaterialType(item.id)}><strong>{item.name}</strong><small>{item.description ?? (item.required ? '必交材料' : '选交材料')}</small></button><R22StatusBadge tone={submitted ? 'success' : item.required ? 'warning' : 'neutral'}>{submitted ? '已提交' : item.required ? '待提交' : '可选'}</R22StatusBadge></li>; })}</ul> : <div className="r22-empty-compact"><strong>{detail.outputName}</strong><p>该节点未配置细分清单，上传文件会作为工序输出材料。</p></div>}
            </R22Card>

            <R22Card className="r22-material-drop-card">
              <div className="r22-section-heading"><div><p className="r22-overline">Upload</p><h2>{replacingId ? '上传替换版本' : '添加新材料'}</h2><p>系统将文件绑定到 {detail.stepName}。</p></div></div>
              <label className="r22-field"><span>材料类型</span><select value={materialType} onChange={(event) => setMaterialType(event.target.value)}>{detail.requiredMaterials.length ? detail.requiredMaterials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value={detail.outputName}>{detail.outputName}</option>}</select></label>
              <label className="r22-upload-zone r22-material-upload-zone" htmlFor="r22-material-file"><span className="r22-upload-icon">↑</span><strong>{file?.name ?? '选择要上传的文件'}</strong><p>支持 PDF、Office、图片及受控压缩包。扩展名、MIME、文件魔数和大小由服务端再次校验。</p><input id="r22-material-file" type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} /></label>
              {file ? <div className="r22-selected-file"><span>{file.name}</span><strong>{formatAttachmentSize(file.size)}</strong></div> : null}
              <div className="r22-material-upload-actions"><button type="button" className="r22-button r22-button-primary" disabled={!file || isUploading} onClick={() => void upload()}>{isUploading ? '正在安全上传…' : replacingId ? '上传并归档旧版本' : '上传材料'}</button>{replacingId ? <button type="button" className="r22-button r22-button-secondary" onClick={() => setReplacingId(null)}>取消替换</button> : null}</div>
            </R22Card>
          </section>

          <R22Card className="r22-material-history">
            <div className="r22-section-heading"><div><p className="r22-overline">History</p><h2>已上传材料</h2><p>{detail.attachments.length} 份有效材料，旧文件不会被物理覆盖。</p></div></div>
              {detail.attachments.length ? <div className="r22-material-table" role="table" aria-label="已上传材料"><div className="r22-material-row r22-material-row-head" role="row"><span>文件</span><span>材料类型</span><span>上传人 / 时间</span><span>版本</span><span>状态</span><span>操作</span></div>{detail.attachments.map((item) => <div className="r22-material-row" role="row" key={item.id}><span><strong>{item.fileName}</strong><small>{formatAttachmentSize(item.fileSize)}</small></span><span>{item.materialType ?? detail.outputName}</span><span><strong>{item.uploadedByName ?? '系统用户'}</strong><small>{new Date(item.uploadedAt).toLocaleString('zh-CN')}</small></span><span>V{item.versionNo ?? versions.get(item.id) ?? 1}</span><span><R22StatusBadge tone="success">{item.status}</R22StatusBadge></span><span className="r22-material-actions"><a href={`${API_BASE_URL}${item.previewUrl}`} target="_blank" rel="noreferrer">查看</a><button type="button" onClick={() => chooseReplacement(item.id)}>替换</button></span></div>)}</div> : <div className="r22-empty-compact"><strong>尚未上传材料</strong><p>选择文件并完成上传后，版本记录会显示在这里。</p></div>}
          </R22Card>
        </>
      ) : null}
    </div>
  );
}

function buildVersions(items: WorkflowTaskInteractionDetail['attachments']) {
  const byName = new Map<string, typeof items>();
  for (const item of [...items].sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt))) {
    const normalized = item.fileName.replace(/\.[^.]+$/, '').replace(/[-_ ]?v\d+$/i, '');
    byName.set(normalized, [...(byName.get(normalized) ?? []), item]);
  }
  const result = new Map<string, number>();
  for (const versions of byName.values()) versions.forEach((item, index) => result.set(item.id, index + 1));
  return result;
}
