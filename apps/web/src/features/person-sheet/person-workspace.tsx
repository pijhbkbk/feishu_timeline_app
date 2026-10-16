'use client';
import Link from 'next/link';
import React, { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';
import { BusinessSheetCanvas } from '../business-sheet/canvas';
import { RecordSheetWorkspace } from '../business-sheet/record-sheet-workspace';
import { RecordForm } from '../business-sheet/record-form';
import type { ImportPlan } from '../business-sheet/record-import';
const RecordImportDialog = lazy(() => import('../business-sheet/record-import').then(module => ({ default: module.RecordImportDialog })));
import { SheetImagePanel } from '../business-sheet/image-panel';
import { useSheetImages } from '../business-sheet/use-images';
import type { RecordSheetRow, RecordWorkspaceContext } from '../business-sheet/record-sheet-types';
import type { ExchangeInput } from '../business-sheet/record-exchange';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { PERSON_COLUMNS, personChanges, personRow, readPersons, savePersons, validatePerson, type DepartmentOption, type PersonRecord } from './person-adapter';
export function PersonSheetWorkspace() {
  const { user } = useAuth();
  const [rows, setRows] = useState<readonly RecordSheetRow<PersonRecord>[]>([]), [departments, setDepartments] = useState<DepartmentOption[]>([]), [hasMore, setHasMore] = useState(false);
  const raw = useRef<PersonRecord[]>([]), choices = useRef<DepartmentOption[]>([]), context = useRef<RecordWorkspaceContext<PersonRecord> | null>(null);
  const [form, setForm] = useState<'new' | 'department' | 'profile-department' | 'link' | null>(null), [importOpen, setImportOpen] = useState(false), [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Array<{ id: string; username: string; name: string; version: string }>>([]);
  const [selected, setSelected] = useState<RecordSheetRow<PersonRecord> | null>(null);
  const ids = rows.map(row => row.id); const images = useSheetImages('SHEET_PERSON', ids);
  useProjectUnsavedChanges(images.pending || Boolean(form) || importOpen);
  const load = useCallback(async (signal: AbortSignal) => {
    const result = await readPersons(signal); if (!signal.aborted) { raw.current = result.items; choices.current = result.departments; setDepartments(result.departments); setHasMore(result.hasMore); } return result.items.map(personRow);
  }, []);
  const save = useCallback((items: Parameters<typeof savePersons>[0], operationId: string) => savePersons(items, operationId, choices.current), []);
  const refresh = async () => { await context.current?.refresh(); await images.reload(); };
  async function link() {
    try {
      const all: typeof accounts = []; let after = '';
      do { const page = await apiRequest<{ items: typeof accounts; nextCursor: string | null }>(`/people${after ? `?after=${after}` : ''}`); all.push(...page.items); after = page.nextCursor ?? ''; } while (after && all.length < 1000);
      setAccounts(all); setForm('link');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '账号读取失败'); }
  }
  async function addPhotos(files: File[], id: string) { try { await images.add(files, id); } catch (cause) { setError(cause instanceof Error ? cause.message : '图片上传失败'); } }
  function prepare(input: ExchangeInput, clear: readonly string[]): ImportPlan {
    let row = input.id ? rows.find(row => row.id === input.id) : undefined;
    if (input.id && !row) return { input, status: 'error', message: '记录不在当前可访问人员档案内。' };
    if (!input.id) {
      const sources = rows.filter(row => row.meta?.originalSource?.fileHash === input.source.fileHash && row.meta.originalSource.sheetName === input.source.sheetName && row.meta.originalSource.rowNumbers.includes(input.row));
      if (sources.length === 1) { row = sources[0]; input = { ...input, id: row!.id, revision: row!.revision }; }
    }
    if (row && input.revision !== row.revision) return { input, status: 'error', message: '记录版本冲突，请导出最新版本后核对。' };
    const allowed = row?.editable ?? ['name', 'departmentName', 'position', 'mobile', 'email', 'note', 'availability'];
    const changes: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(input.values)) {
      if (field === 'photos' || (value === null || value === '') && !clear.includes(field)) continue;
      if (row && (row.values[field] ?? null) === value) continue;
      if (!allowed.includes(field)) return { input, status: 'error', message: `${PERSON_COLUMNS.find(column => column.key === field)?.label ?? field}是只读信息，不能导入修改。` };
      const issue = validatePerson(row ?? { id: input.clientId, revision: 1, values: input.values, editable: allowed }, field, value); if (issue) return { input, status: 'error', message: issue };
      changes[field] = value;
    }
    if (!row && !changes.name) return { input, status: 'error', message: '新人员档案必须填写姓名。' };
    try { const converted = personChanges(changes, departments); return { input, status: row ? Object.keys(changes).length ? 'update' : 'unchanged' : 'create', message: row ? Object.keys(changes).map(key => `${PERSON_COLUMNS.find(column => column.key === key)?.label}：${row.values[key] ?? '空'} → ${changes[key] ?? '空'}`).join('；') : '创建独立人员档案，不创建账号或业务资格。', data: converted }; }
    catch (cause) { return { input, status: 'error', message: cause instanceof Error ? cause.message : '字段关联无效' }; }
  }
  async function apply(plans: ImportPlan[], operationId: string) {
    const result: Array<{ clientId: string; id: string }> = [];
    const created = plans.filter(plan => plan.status === 'create'), updated = plans.filter(plan => plan.status === 'update');
    if (created.length) { const saved = await apiRequest<{ items: Array<PersonRecord & { clientId: string }> }>('/persons', { method: 'POST', body: { operationId: `${operationId}_create`, items: created.map(plan => ({ clientId: plan.input.clientId, fields: plan.data, source: plan.input.source })) } }); result.push(...saved.items.map(row => ({ clientId: row.clientId, id: row.id }))); }
    if (updated.length) { const saved = await apiRequest<{ items: PersonRecord[] }>('/persons/sheet', { method: 'PATCH', body: { operationId: `${operationId}_update`, items: updated.map(plan => ({ id: plan.input.id, expectedRevision: plan.input.revision, changes: plan.data })) } }); result.push(...saved.items.map(row => ({ id: row.id, clientId: updated.find(plan => plan.input.id === row.id)!.input.clientId }))); }
    return result;
  }
  return <>
    {error ? <p className="m1-error" role="alert">{error}<button onClick={() => setError('')}>关闭提示</button></p> : null}
    <RecordSheetWorkspace<PersonRecord> title="人员库" columns={PERSON_COLUMNS} Canvas={BusinessSheetCanvas} load={load} save={save} validate={validatePerson} onRowsLoaded={setRows} onSelection={setSelected}
      canvasProps={{ images: images.images, imageActions: { add: (files, id) => { void addPhotos(files, id); }, change: images.change, remove: images.remove, requestFiles: () => document.querySelector<HTMLInputElement>('[aria-label="选择记录图片"]')?.click() } }}
      onCreate={value => { context.current = value; setForm('new'); }} onImport={value => { context.current = value; setImportOpen(true); }}
      onExport={async exported => { const { downloadWorkbook, exportRecordWorkbook } = await import('../business-sheet/record-exchange'); downloadWorkbook(await exportRecordWorkbook('人员库', 'personnel', PERSON_COLUMNS, exported, images.images), '人员库-含图模板.xlsx'); }}
      slots={{ header: value => { context.current = value; return <><p>维护独立人员档案。账号准入、业务资格与任务归属由原业务入口办理。</p>{user?.isSystemAdmin ? <Link className="m1-button" href="/admin/people/permissions">账号与业务资格</Link> : null}{hasMore ? <p>当前载入前 2000 条档案；导出与搜索覆盖这些记录。</p> : null}</>; }, detail: value => {
        context.current = value; const record = value.selected?.meta; if (!record) return null;
        return <><h3>{value.selected!.values.name}</h3><dl>{PERSON_COLUMNS.filter(column => column.key !== 'photos').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{value.selected!.values[column.key] || '—'}</dd></div>)}</dl>
          {!record.account ? <button className="m1-button" disabled={!!value.dirtyCount} onClick={() => setForm('profile-department')}>调整档案部门</button> : null}
          {user?.isSystemAdmin && record.account ? <button className="m1-button" disabled={!!value.dirtyCount} onClick={() => setForm('department')}>调整关联人员部门</button> : null}
          {user?.isSystemAdmin && !record.account ? <button className="m1-button" disabled={!!value.dirtyCount} onClick={() => void link()}>明确关联已有账号</button> : null}
          {record.account ? <p>关联账号：{record.account.username}；{record.account.teamAccessApproved ? '已准入' : '未准入'}。岗位说明不会改变业务资格。</p> : <p>此档案尚无关联账号，不会成为任务候选账号。</p>}
          <SheetImagePanel state={images} recordId={record.id} recordName={value.selected!.values.name ?? '人员档案'} /></>;
      } }} />
    {form === 'new' ? <RecordForm title="新增人员档案" fields={[{ key: 'name', label: '姓名', required: true, maxLength: 100 }, { key: 'departmentId', label: '部门', options: departments.map(department => ({ value: department.id, label: department.name })) }, { key: 'position', label: '岗位说明', maxLength: 100 }, { key: 'mobile', label: '电话', maxLength: 32 }, { key: 'email', label: '邮箱', maxLength: 160 }, { key: 'note', label: '备注', type: 'textarea' }]} onClose={() => setForm(null)} submit={async (values, operationId) => { await apiRequest('/persons', { method: 'POST', body: { operationId, items: [{ clientId: 'new_person', fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])) }] } }); await refresh(); }} /> : null}
    {form === 'profile-department' && selected ? <RecordForm title="调整档案部门" fields={[{ key: 'departmentId', label: '部门', initial: selected.meta?.departmentId ?? '', options: departments.map(department => ({ value: department.id, label: department.name })) }]} onClose={() => setForm(null)} submit={async (values, operationId) => { await apiRequest('/persons/sheet', { method: 'PATCH', body: { operationId, items: [{ id: selected.id, expectedRevision: selected.revision, changes: { departmentId: values.departmentId || null } }] } }); await refresh(); }} /> : null}
    {form === 'department' && selected ? <RecordForm title="调整关联人员部门" fields={[{ key: 'departmentId', label: '部门', initial: selected.meta?.departmentId ?? '', options: departments.map(department => ({ value: department.id, label: department.name })) }, { key: 'reason', label: '调整原因', required: true, maxLength: 500 }]} onClose={() => setForm(null)} submit={async (values, operationId) => { await apiRequest(`/persons/${selected.id}/department`, { method: 'PATCH', body: { operationId, expectedRevision: selected.revision, departmentId: values.departmentId || null, reason: values.reason } }); await refresh(); }} /> : null}
    {form === 'link' && selected ? <RecordForm title="明确关联已有账号" fields={[{ key: 'userId', label: '已有账号', required: true, options: accounts.map(account => ({ value: account.id, label: `${account.name} · ${account.username}` })) }, { key: 'reason', label: '关联原因', required: true, maxLength: 500 }]} onClose={() => setForm(null)} submit={async (values, operationId) => { const account = accounts.find(account => account.id === values.userId); if (!account) throw new Error('请选择明确账号。'); await apiRequest(`/persons/${selected.id}/account-link`, { method: 'POST', body: { operationId, expectedRevision: selected.revision, userId: account.id, expectedUserVersion: account.version, reason: values.reason } }); await refresh(); }} /> : null}
    {importOpen ? <Suspense fallback={<p role="status">正在读取 Excel 工具…</p>}><RecordImportDialog title="人员库" module="personnel" columns={PERSON_COLUMNS} rows={rows} images={images.images} imageTarget="SHEET_PERSON" prepare={prepare} apply={apply} onSaved={refresh} onClose={() => setImportOpen(false)} /></Suspense> : null}
  </>;
}
