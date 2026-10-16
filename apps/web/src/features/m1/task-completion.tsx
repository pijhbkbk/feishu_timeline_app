'use client';

import React, { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '../../lib/auth-client';
import { CompletionDrawer, type CompletionPanelState } from '../v2/real-workspace-page';
import { createGate3C1IdempotencyKey, r26Gate3C1Request } from '../v2/r26-gate3c1-client';
import type { R26CompletionPreview, R26OrdinaryCompletionCommand, R26OrdinaryCompletionResponse, R26ResolveBlockerResponse, R26TaskDetail, R26TaskResponse } from '../v2/real-types';
import { taskHref } from './context';
import { useProjectUnsavedChanges } from './use-unsaved';

function initialState(): CompletionPanelState {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return { preview: null, pending: false, error: null, colorNumber: '', completionReason: '', acknowledgedConsequences: false, resolutionSummary: '', actualResolvedAt: local.toISOString().slice(0, 16), success: null };
}

export function M1TaskCompletion({ task, onUpdated }: { task: R26TaskDetail; onUpdated: () => void }) {
  const router = useRouter();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CompletionPanelState>(initialState);
  const version = useRef(task.taskVersion);
  const pending = useRef(false);
  const changed = useRef(false);
  const commands = useRef(new Map<string, string>());
  const dirty = !state.success && Boolean(state.colorNumber.trim() || state.completionReason.trim() || state.resolutionSummary.trim() || state.acknowledgedConsequences);
  const allowLeave = useProjectUnsavedChanges(dirty);
  const taskPath = `/v2/tasks/${encodeURIComponent(task.taskId)}`;
  function commandId(action: string, body: Record<string, unknown>) {
    const fingerprint = `${task.taskId}:${action}:${JSON.stringify(body)}`;
    let key = commands.current.get(fingerprint);
    if (!key) { key = createGate3C1IdempotencyKey(action); commands.current.set(fingerprint, key); }
    return key;
  }
  function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
  async function preview(refreshTask: boolean) {
    if (pending.current) return;
    pending.current = true;
    setOpen(true);
    setState(current => ({ ...current, pending: true, error: null }));
    try {
      if (refreshTask) {
        const detail = await apiRequest<R26TaskResponse>(taskPath, { signal: AbortSignal.timeout(15000) });
        if (detail.task.projectId !== task.projectId || detail.task.taskId !== task.taskId) throw new Error('任务所属项目已变化。');
        version.current = detail.task.taskVersion;
      }
      const colorNumber = state.colorNumber.trim();
      const response = await r26Gate3C1Request<R26CompletionPreview>(`${taskPath}/completion-preview`, { body: { taskVersion: version.current, ...(task.nodeCode === 'COLOR_NUMBERING' && colorNumber ? { colorNumber } : {}) } });
      version.current = response.currentTask.taskVersion;
      setState(current => ({ ...current, preview: response, pending: false }));
    } catch (error) { setState(current => ({ ...current, pending: false, error: errorMessage(error, '完成条件读取失败，请重试。') })); }
    finally { pending.current = false; }
  }
  async function resolve(blockerId: string) {
    if (pending.current) return;
    const summary = state.resolutionSummary.trim();
    const resolvedAt = new Date(state.actualResolvedAt);
    if (!summary || !Number.isFinite(resolvedAt.getTime())) { setState(current => ({ ...current, error: '请填写解决说明和有效的实际解除时间。' })); return; }
    pending.current = true;
    setState(current => ({ ...current, pending: true, error: null }));
    const body = { taskVersion: version.current, actualResolvedAt: resolvedAt.toISOString(), resolutionSummary: summary };
    const idempotencyKey = commandId(`resolve:${blockerId}`, body);
    try {
      const response = await r26Gate3C1Request<R26ResolveBlockerResponse>(`${taskPath}/blockers/${encodeURIComponent(blockerId)}/resolve`, { body: { ...body, idempotencyKey }, idempotencyKey });
      version.current = response.viewModel.task.task.taskVersion;
      changed.current = true;
      setState(current => ({ ...current, preview: response.viewModel.completionPreview, pending: false, resolutionSummary: '', error: null }));
    } catch (error) { setState(current => ({ ...current, pending: false, error: errorMessage(error, '解除阻塞失败，请重试。') })); }
    finally { pending.current = false; }
  }
  async function complete() {
    if (pending.current || !state.preview?.canComplete) return;
    const completionReason = state.completionReason.trim();
    const colorNumber = state.colorNumber.trim();
    if (!completionReason || !state.acknowledgedConsequences) { setState(current => ({ ...current, error: '请填写完成说明并确认推进影响。' })); return; }
    if (task.nodeCode === 'COLOR_NUMBERING' && (!colorNumber || state.preview.colorNumbering?.normalizedCode !== colorNumber.toLocaleUpperCase('zh-CN') || state.preview.colorNumbering.blockingReasons.length)) { setState(current => ({ ...current, error: '请先验证颜色编号及确认材料。' })); return; }
    pending.current = true;
    setState(current => ({ ...current, pending: true, error: null }));
    const body = { taskVersion: version.current, completionReason, acknowledgedConsequences: true, ...(task.nodeCode === 'COLOR_NUMBERING' ? { colorNumber } : {}) };
    const idempotencyKey = commandId('complete', body);
    try {
      const response = await r26Gate3C1Request<R26OrdinaryCompletionResponse>(`${taskPath}/complete`, { body: { ...body, idempotencyKey }, idempotencyKey });
      changed.current = true;
      allowLeave();
      setState(current => ({ ...current, pending: false, success: response.command, error: null }));
    } catch (error) { setState(current => ({ ...current, pending: false, error: errorMessage(error, '完成工序失败，请重试。') })); }
    finally { pending.current = false; }
  }
  function close() {
    if (pending.current) return;
    setOpen(false);
    // Keep incomplete form input so closing and reopening can refresh a changed task version.
    if (state.success) onUpdated();
    else if (changed.current && !dirty) onUpdated();
  }
  function viewTask(next: R26OrdinaryCompletionCommand['createdTasks'][number]) {
    allowLeave();
    const source = search.get('from') === 'dashboard' ? 'dashboard' : 'project';
    router.push(taskHref(task.projectId, next.taskId, source, search.toString()));
  }
  // Later steps already expose their existing domain-specific recording action in the work form.
  if (task.stepNumber < 1 || task.stepNumber > 11) return null;
  return <>
    <button type="button" className="m1-button" onClick={() => void preview(true)} disabled={pending.current}>检查工序完成条件</button>
    {open ? <div data-ui-version="r26-v2" className="m1-task-completion"><CompletionDrawer task={task} state={state} onChange={patch => setState(current => ({ ...current, ...patch }))} onResolve={blockerId => void resolve(blockerId)} onRefreshPreview={() => void preview(true)} onConfirm={() => void complete()} onViewTask={viewTask} onClose={close} /></div> : null}
  </>;
}
