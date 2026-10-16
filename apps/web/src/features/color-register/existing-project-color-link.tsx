'use client';
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiRequestError, apiRequest } from '../../lib/auth-client';
import { fetchStandardBoardWorkspace, type StandardBoardWorkspaceResponse } from '../../lib/standard-boards-client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { ProjectColorPicker, type ProjectColorChoice } from './project-color-picker';

type Context = { projectId: string; primaryColorId: string | null; expectedProjectUpdatedAt: string };
type Result = { projectId: string; colorId: string; productionBaseId: string };
export async function saveExistingProjectColorLink(projectId: string, body: Record<string, unknown>) {
  const result = await apiRequest<Result>(`/projects/${encodeURIComponent(projectId)}/color-link`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  const workspace = await fetchStandardBoardWorkspace(projectId);
  if (result.projectId !== projectId || workspace.project.primaryColor?.id !== result.colorId || workspace.project.primaryColor.productionBaseId !== result.productionBaseId) throw new Error('保存已返回，尚未核对到同一颜色与基地。请选择重试，原请求编号会继续使用。');
  return workspace;
}
export function ExistingProjectColorLink({ projectId, canManage, onSaved }: { projectId: string; canManage: boolean; onSaved: (workspace: StandardBoardWorkspaceResponse) => void }) {
  const [context, setContext] = useState<Context | null>(null);
  const [choice, setChoice] = useState<ProjectColorChoice>({ colorMode: 'EXISTING', colorName: '', productionBaseId: '', existingColorId: '' });
  const [revision, setRevision] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const command = useRef<{ fingerprint: string; body: Record<string, unknown> } | null>(null);
  useProjectUnsavedChanges(Boolean(choice.existingColorId));
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setContext(null); setError('');
    void apiRequest<Context>(`/projects/${encodeURIComponent(projectId)}/color-link`, { signal: controller.signal })
      .then(async next => {
        if (!active) return;
        setContext(next);
        if (next.primaryColorId) {
          const workspace = await fetchStandardBoardWorkspace(projectId);
          if (active && workspace.project.primaryColor?.id === next.primaryColorId) onSaved(workspace);
        }
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '项目核对信息读取失败。'); });
    const timer = setTimeout(() => controller.abort(), 15000);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [projectId, reload, onSaved]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !canManage || !context || !choice.existingColorId || revision === null || !checked) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const fields = { existingColorId: choice.existingColorId, productionBaseId: choice.productionBaseId, expectedColorRevision: revision, expectedProjectUpdatedAt: context.expectedProjectUpdatedAt };
      const fingerprint = JSON.stringify(fields);
      if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, body: { ...fields, idempotencyKey: crypto.randomUUID() } };
      const next = await saveExistingProjectColorLink(projectId, command.current.body);
      setChoice({ colorMode: 'EXISTING', colorName: '', productionBaseId: '', existingColorId: '' });
      command.current = null; onSaved(next);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) command.current = null;
      setError(cause instanceof Error ? cause.message : '关联失败，已选择的记录仍保留。');
    } finally { pending.current = false; setBusy(false); }
  }
  return <section className="page-card"><h3>核对现有项目的颜色身份</h3><p>请选择准确的颜色与生产基地。此操作保留项目、历史作者和来源记录；保存后不能在此换绑。</p>
    <form onSubmit={event => void submit(event)}>
      <ProjectColorPicker existingOnly value={choice} onChange={next => { setChoice(next); setRevision(null); setChecked(false); }} onSelectedRevision={setRevision} disabled={!canManage || busy} />
      <label className="field" style={{ marginBlock: 16 }}><span><input type="checkbox" checked={checked} disabled={!choice.existingColorId || busy} onChange={event => setChecked(event.target.checked)} /> 已核对基地、名称、色板编号与来源，确认关联这条记录</span></label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <div className="inline-actions"><button type="submit" className="button button-primary" disabled={!canManage || busy || !context || !checked || revision === null}>{busy ? '正在关联并核对…' : '保存颜色关联'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => { command.current = null; setReload(value => value + 1); }}>重新读取项目版本</button></div>
    </form></section>;
}
