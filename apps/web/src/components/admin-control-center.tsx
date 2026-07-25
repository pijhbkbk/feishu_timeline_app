'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

import {
  applyAdminTaskImport,
  createAdminTemplateVersion,
  fetchAdminAssignments,
  fetchAdminDictionaries,
  fetchAdminOrganization,
  fetchAdminPermissions,
  fetchAdminProjects,
  fetchAdminSavedViews,
  fetchAdminTasks,
  fetchAdminWorkflowTemplates,
  getAdminTaskExportUrl,
  getAdminTaskImportTemplateUrl,
  previewAdminAssignment,
  previewAdminBatchTasks,
  previewAdminSchedule,
  previewAdminTaskImport,
  saveAdminView,
  updateAdminAssignment,
  updateAdminBatchTasks,
  updateAdminDictionary,
  updateAdminProject,
  updateAdminSchedule,
  updateAdminUserStatus,
  type AdminAssignmentResponse,
  type AdminDictionaryResponse,
  type AdminOrganizationResponse,
  type AdminPermissionResponse,
  type AdminProjectRow,
  type AdminSavedView,
  type AdminTaskRow,
  type AdminWorkflowResponse,
} from '../lib/admin-client';

export type AdminControlSection =
  | 'projects'
  | 'tasks'
  | 'organization'
  | 'assignments'
  | 'permissions'
  | 'workflow-templates'
  | 'dictionaries';

type AdminNavigationSection = AdminControlSection | 'audit-logs';

const sections: Array<{
  key: AdminNavigationSection;
  label: string;
  description: string;
}> = [
  { key: 'projects', label: '项目台账', description: '项目状态、当前工序、风险和版本' },
  { key: 'tasks', label: '工序台账', description: '18 步任务、责任、计划和材料' },
  { key: 'organization', label: '组织与人员', description: '用户、部门和项目成员' },
  { key: 'assignments', label: '分工配置', description: '项目 18 节点责任矩阵' },
  { key: 'permissions', label: '角色权限', description: '服务端 RBAC 权限矩阵' },
  { key: 'workflow-templates', label: '流程模板', description: '模板版本和节点参数' },
  { key: 'dictionaries', label: '基础字典', description: '业务枚举和系统参数' },
  { key: 'audit-logs', label: '审计与异常', description: '关键操作与失败记录' },
];

export function AdminControlNavigation({
  active,
}: {
  active: AdminNavigationSection;
}) {
  return (
    <nav className="admin-cc-nav" aria-label="系统管理导航">
      {sections.map((item) => (
        <Link
          key={item.key}
          href={`/admin/${item.key}`}
          className={item.key === active ? 'is-active' : undefined}
          aria-current={item.key === active ? 'page' : undefined}
          title={item.description}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const pageMeta: Record<AdminControlSection, { eyebrow: string; title: string; description: string }> = {
  projects: {
    eyebrow: '后台控制中心',
    title: '项目总台账',
    description: '在一个表格中核对项目状态、当前工序、负责人、风险和计划日期。',
  },
  tasks: {
    eyebrow: '后台控制中心',
    title: '工序总台账',
    description: '按项目、步骤、责任、状态和风险检索真实工序；历史记录只读。',
  },
  organization: {
    eyebrow: '组织治理',
    title: '组织与人员',
    description: '查看系统用户、公司部门和项目成员关系，人员状态变更全程留痕。',
  },
  assignments: {
    eyebrow: '责任治理',
    title: '项目分工配置',
    description: '按项目查看 18 节点主责部门、建议负责人、协同与评审关系。',
  },
  permissions: {
    eyebrow: '权限治理',
    title: '角色与权限',
    description: '展示后端实际执行的 RBAC 矩阵；系统角色和边界规则保持锁定。',
  },
  'workflow-templates': {
    eyebrow: '流程治理',
    title: '流程模板与节点',
    description: '节点拓扑只读；变更通过新模板版本影响未来项目，不改写运行中项目。',
  },
  dictionaries: {
    eyebrow: '参数治理',
    title: '基础字典与参数',
    description: '仅开放非系统保留项的受控维护，冻结业务规则不能直接编辑。',
  },
};

type LoadState = {
  projects?: { items: AdminProjectRow[]; total: number; totalPages: number };
  tasks?: { items: AdminTaskRow[]; total: number; totalPages: number };
  organization?: AdminOrganizationResponse;
  assignments?: AdminAssignmentResponse;
  permissions?: AdminPermissionResponse;
  workflow?: AdminWorkflowResponse;
  dictionaries?: AdminDictionaryResponse;
};

type DialogState =
  | { kind: 'project'; row: AdminProjectRow }
  | { kind: 'task'; row: AdminTaskRow; mode: 'schedule' | 'assignment' }
  | { kind: 'batch'; rows: AdminTaskRow[]; mode: 'schedule' | 'assignment' }
  | { kind: 'import'; csv: string; fileName: string }
  | { kind: 'user'; row: Record<string, unknown> }
  | { kind: 'dictionary'; row: AdminDictionaryResponse['categories'][number]['items'][number] }
  | { kind: 'template'; row: AdminWorkflowResponse['templates'][number] }
  | null;

export function AdminControlCenter({ section }: { section: AdminControlSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meta = pageMeta[section];
  const [data, setData] = useState<LoadState>({});
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [appliedSearch, setAppliedSearch] = useState(() => searchParams.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('ALL');
  const [organizationTab, setOrganizationTab] =
    useState<'users' | 'departments' | 'members'>('users');
  const [projectId, setProjectId] = useState('');
  const [savedViews, setSavedViews] = useState<AdminSavedView[]>([]);
  const [fullColumns, setFullColumns] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (section === 'projects') {
        const result = await fetchAdminProjects({
          page,
          pageSize: 20,
          search: appliedSearch,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        });
        setData({ projects: result });
      } else if (section === 'tasks') {
        const result = await fetchAdminTasks({
          page,
          pageSize: 20,
          search: appliedSearch,
          view,
          sortBy: 'effectiveDueAt',
          sortOrder: 'asc',
        });
        setData({ tasks: result });
      } else if (section === 'organization') {
        const result = await fetchAdminOrganization({
          page,
          pageSize: 20,
          search: appliedSearch,
          tab: organizationTab,
        });
        setData({ organization: result });
      } else if (section === 'assignments') {
        const result = await fetchAdminAssignments(projectId || undefined);
        setData({ assignments: result });
        if (!projectId && result.selectedProjectId) setProjectId(result.selectedProjectId);
      } else if (section === 'permissions') {
        setData({ permissions: await fetchAdminPermissions() });
      } else if (section === 'workflow-templates') {
        setData({ workflow: await fetchAdminWorkflowTemplates() });
      } else {
        setData({ dictionaries: await fetchAdminDictionaries() });
      }
      setSavedViews(await fetchAdminSavedViews(section));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '后台数据加载失败。');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, organizationTab, page, projectId, section, view]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  async function saveCurrentView() {
    const name = window.prompt('请输入视图名称');
    if (!name?.trim()) return;
    try {
      await saveAdminView({
        pageKey: section,
        name: name.trim(),
        config: {
          search: appliedSearch,
          view,
          organizationTab,
          projectId,
          fullColumns,
        },
      });
      setNotice('视图已保存。');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存视图失败。');
    }
  }

  function applySavedView(savedView: AdminSavedView) {
    const config = savedView.config;
    setSearch(readText(config.search));
    setAppliedSearch(readText(config.search));
    setView(readText(config.view) || 'ALL');
    if (config.organizationTab === 'users' || config.organizationTab === 'departments' || config.organizationTab === 'members') {
      setOrganizationTab(config.organizationTab);
    }
    setProjectId(readText(config.projectId));
    setFullColumns(readBoolean(config.fullColumns));
    setPage(1);
  }

  async function selectImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('导入文件超过 1 MB，已拒绝读取。');
      return;
    }
    try {
      const csv = await file.text();
      setDialog({ kind: 'import', csv, fileName: file.name });
    } catch {
      setError('无法读取导入文件，请重新选择正式 CSV 模板。');
    }
  }

  const pageInfo =
    data.projects ?? data.tasks ?? data.organization;

  return (
    <div className="admin-cc-page" data-testid={`admin-${section}-page`}>
      <AdminControlNavigation active={section} />

      <header className="admin-cc-hero">
        <div>
          <p>{meta.eyebrow}</p>
          <h1>{meta.title}</h1>
          <span>{meta.description}</span>
        </div>
        <div className="admin-cc-hero__actions">
          <button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={() => void load()} disabled={loading}>
            {loading ? '读取中…' : '刷新数据'}
          </button>
        </div>
      </header>

      {error ? <div className="admin-cc-alert admin-cc-alert--error"><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div> : null}
      {notice ? <div className="admin-cc-alert admin-cc-alert--success"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>关闭</button></div> : null}

      <section className="admin-cc-toolbar" aria-label="表格工具栏">
        {(section === 'projects' || section === 'tasks' || section === 'organization') ? (
          <form onSubmit={applySearch} className="admin-cc-search">
            <label htmlFor="admin-table-search">搜索</label>
            <input id="admin-table-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名称、编号、人员或工序" />
            <button type="submit" className="admin-cc-button admin-cc-button--primary">查询</button>
          </form>
        ) : <div><strong>真实数据</strong><span> 由服务端实时返回</span></div>}
        <div className="admin-cc-toolbar__right">
          <label>
            保存视图
            <select defaultValue="" onChange={(event) => {
              const selected = savedViews.find((item) => item.id === event.target.value);
              if (selected) applySavedView(selected);
            }}>
              <option value="">选择视图</option>
              {savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={() => void saveCurrentView()}>保存当前视图</button>
          {(section === 'projects' || section === 'tasks') ? <button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={() => setFullColumns((current) => !current)}>{fullColumns ? '使用精简列' : '显示完整列'}</button> : null}
          {section === 'tasks' ? <>
            <a className="admin-cc-button admin-cc-button--quiet" href={getAdminTaskExportUrl({ search: appliedSearch, view })}>导出当前筛选</a>
            <a className="admin-cc-button admin-cc-button--quiet" href={getAdminTaskImportTemplateUrl()}>下载导入模板</a>
            <label className="admin-cc-button admin-cc-button--quiet admin-cc-import-button">导入计划日期<input type="file" accept=".csv,text/csv" onChange={(event) => void selectImportFile(event)} /></label>
          </> : null}
        </div>
      </section>

      {section === 'tasks' ? <TaskPresets value={view} onChange={(next) => { setView(next); setPage(1); }} /> : null}
      {section === 'tasks' && selectedTaskIds.length ? (
        <section className="admin-cc-batch-bar" aria-label="批量操作">
          <div><strong>已选择 {selectedTaskIds.length} 条工序</strong><span>提交前将逐条校验状态、版本、项目成员和影响。</span></div>
          <div>
            <button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={() => setSelectedTaskIds([])}>取消选择</button>
            <button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={() => setDialog({ kind: 'batch', rows: data.tasks?.items.filter((row) => selectedTaskIds.includes(row.id)) ?? [], mode: 'assignment' })}>批量设置负责人</button>
            <button type="button" className="admin-cc-button admin-cc-button--primary" onClick={() => setDialog({ kind: 'batch', rows: data.tasks?.items.filter((row) => selectedTaskIds.includes(row.id)) ?? [], mode: 'schedule' })}>批量调整截止日期</button>
          </div>
        </section>
      ) : null}
      {section === 'organization' ? <OrganizationTabs value={organizationTab} onChange={(next) => { setOrganizationTab(next); setPage(1); }} /> : null}

      <section className="admin-cc-table-card">
        {loading && !hasSectionData(section, data) ? <AdminTableSkeleton /> : null}
        {section === 'projects' && data.projects ? <ProjectsTable rows={data.projects.items} fullColumns={fullColumns} onEdit={(row) => setDialog({ kind: 'project', row })} /> : null}
        {section === 'tasks' && data.tasks ? <TasksTable rows={data.tasks.items} fullColumns={fullColumns} selectedIds={selectedTaskIds} onSelect={setSelectedTaskIds} onEdit={(row, mode) => setDialog({ kind: 'task', row, mode })} /> : null}
        {section === 'organization' && data.organization ? (
          <OrganizationTable
            response={data.organization}
            onUserEdit={(row) => setDialog({ kind: 'user', row })}
          />
        ) : null}
        {section === 'assignments' && data.assignments ? <AssignmentsTable response={data.assignments} projectId={projectId} onProjectChange={(next) => setProjectId(next)} /> : null}
        {section === 'permissions' && data.permissions ? <PermissionsTable response={data.permissions} /> : null}
        {section === 'workflow-templates' && data.workflow ? <WorkflowTable response={data.workflow} onVersion={(row) => setDialog({ kind: 'template', row })} /> : null}
        {section === 'dictionaries' && data.dictionaries ? <DictionariesTable response={data.dictionaries} onEdit={(row) => setDialog({ kind: 'dictionary', row })} /> : null}
      </section>

      {pageInfo ? <Pagination page={page} totalPages={pageInfo.totalPages} total={pageInfo.total} onChange={setPage} /> : null}

      {dialog ? (
        <AdminEditDialog
          state={dialog}
          onClose={() => setDialog(null)}
          onSuccess={async (message) => {
            setDialog(null);
            setNotice(message);
            await load();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectsTable({ rows, fullColumns, onEdit }: { rows: AdminProjectRow[]; fullColumns: boolean; onEdit: (row: AdminProjectRow) => void }) {
  if (!rows.length) return <AdminEmpty title="没有项目记录" description="当前筛选范围内没有真实项目。" />;
  return (
    <>
      <div className="admin-cc-table-wrap">
        <table className="admin-cc-table">
          <thead><tr><th>项目</th><th>颜色 / 车型</th><th>当前工序</th><th>负责人 / 部门</th><th>风险</th><th>进度</th>{fullColumns ? <><th>成员 / 材料</th><th>计划开始</th><th>实际开始</th><th>实际完成</th></> : null}<th>计划结束</th><th>数据版本</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id}>
              <td><strong>{row.name}</strong><small>{displayProjectCode(row.code)}</small></td>
              <td>{row.color?.name ?? '未设置'}<small>{row.vehicleModel ?? '车型未设置'}</small></td>
              <td>{row.currentTask?.nodeName ?? (row.status === 'COMPLETED' ? '流程已完成' : '尚未生成')}<small>{statusLabel(row.currentTask?.status ?? row.status)}</small></td>
              <td>{row.currentTask?.assignee?.name ?? row.owner?.name ?? '待分配'}<small>{row.owningDepartment?.name ?? '责任部门待定'}</small></td>
              <td><RiskBadge risk={row.riskLevel} /><small>{row.blockerCount} 阻塞 · {row.overdueCount} 逾期</small></td>
              <td>{row.progress.completed}/{row.progress.total}<small>{row.taskCount} 条任务</small></td>
              {fullColumns ? <><td>{row.memberCount} 人 / {row.materialCount} 项</td><td>{formatDate(row.plannedStartDate)}</td><td>{formatDate(row.actualStartDate)}</td><td>{formatDate(row.actualEndDate)}</td></> : null}
              <td>{formatDate(row.plannedEndDate)}</td>
              <td><code>{shortVersion(row.dataVersion)}</code></td>
              <td><div className="admin-cc-row-actions"><button type="button" onClick={() => onEdit(row)}>编辑基础信息</button><Link href={`/projects/${row.id}`}>打开项目</Link></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="admin-cc-mobile-list">{rows.map((row) => <article key={row.id}><header><strong>{row.name}</strong><RiskBadge risk={row.riskLevel} /></header><p>{displayProjectCode(row.code)} · {row.color?.name ?? '未设置颜色'}</p><dl><div><dt>当前工序</dt><dd>{row.currentTask?.nodeName ?? '尚未生成'}</dd></div><div><dt>负责人</dt><dd>{row.currentTask?.assignee?.name ?? '待分配'}</dd></div><div><dt>进度</dt><dd>{row.progress.completed}/{row.progress.total}</dd></div></dl><Link href={`/projects/${row.id}`}>打开项目</Link><small>移动端仅供查看，请在桌面端完成编辑。</small></article>)}</div>
    </>
  );
}

function TasksTable({ rows, fullColumns, selectedIds, onSelect, onEdit }: { rows: AdminTaskRow[]; fullColumns: boolean; selectedIds: string[]; onSelect: (ids: string[]) => void; onEdit: (row: AdminTaskRow, mode: 'schedule' | 'assignment') => void }) {
  if (!rows.length) return <AdminEmpty title="没有工序记录" description="当前筛选范围内没有真实工序。" />;
  return (
    <>
      <div className="admin-cc-table-wrap">
        <table className="admin-cc-table">
          <thead>
            {fullColumns ? <tr className="admin-cc-column-groups"><th /><th colSpan={3}>项目与工序</th><th colSpan={4}>工作内容与输出</th><th colSpan={7}>日期与期限</th><th colSpan={4}>人员与部门</th><th colSpan={2}>状态与风险</th><th colSpan={2}>系统记录</th></tr> : null}
            <tr><th><input aria-label="选择当前页全部可编辑工序" type="checkbox" checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))} onChange={(event) => onSelect(event.target.checked ? rows.map((row) => row.id) : [])} /></th><th>项目</th><th>步骤 / 工序</th><th>分支</th>{fullColumns ? <><th>工作内容</th><th>要求输出</th><th>必交材料</th><th>前置 / 流转</th><th>计划开始</th></> : null}<th>主责部门</th><th>负责人</th>{fullColumns ? <><th>协同人员</th><th>评审人员</th></> : null}<th>计划截止</th>{fullColumns ? <><th>实际开始</th><th>实际完成</th><th>工期</th><th>暂停</th><th>最近更新</th></> : null}<th>材料</th><th>状态 / 风险</th><th>参数来源</th><th>操作</th></tr>
          </thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td><input aria-label={`选择 ${row.project.name} ${row.nodeName}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={(event) => onSelect(event.target.checked ? [...new Set([...selectedIds, row.id])] : selectedIds.filter((id) => id !== row.id))} /></td>
            <td><strong>{row.project.name}</strong><small>{displayProjectCode(row.project.code)}</small></td>
            <td><strong>第 {row.stepNumber ?? '—'} 步</strong><small>{row.nodeName}</small></td>
            <td>{row.branchType === 'NON_BLOCKING' ? '非阻塞支线' : '项目主线'}</td>
            {fullColumns ? <><td>{row.workContent ?? '—'}</td><td>{row.requiredOutput ?? '—'}</td><td>{row.requiredMaterials.join('、') || '无'}</td><td>{row.predecessor.join('、') || '起始节点'}<small>{row.autoTransitionRule ?? '服务端裁决'}</small></td><td>{formatDate(row.plannedStartAt)}</td></> : null}
            <td>{row.primaryDepartment?.name ?? '待确定'}</td>
            <td>{row.assignee?.name ?? '待分配'}<small>{assignmentSourceLabel(row.assignmentSource)}</small></td>
            {fullColumns ? <><td>{row.collaboratorUserIds.length ? `${row.collaboratorUserIds.length} 人` : '—'}</td><td>{row.reviewerUserIds.length ? `${row.reviewerUserIds.length} 人` : '—'}</td></> : null}
            <td>{formatDate(row.plannedDueAt)}<small>{row.overdueDays > 0 ? `逾期 ${row.overdueDays} 天` : '未逾期'}</small></td>
            {fullColumns ? <><td>{formatDate(row.actualStartAt)}</td><td>{formatDate(row.actualCompletedAt)}</td><td>{row.durationDays ?? '—'} 天</td><td>{row.pauseDays} 天</td><td>{formatDate(row.updatedAt)}</td></> : null}
            <td>{row.materialProgress.completed}/{row.materialProgress.required}</td>
            <td><StatusBadge value={row.status} /><small><RiskBadge risk={row.riskLevel} /></small></td>
            <td><code>{row.taskVersion ? '服务端版本' : '模板默认'}</code></td>
            <td><div className="admin-cc-row-actions">
              <button type="button" disabled={!row.availableActions.includes('CHANGE_SCHEDULE')} onClick={() => onEdit(row, 'schedule')}>调整计划</button>
              <button type="button" disabled={!row.availableActions.includes('CHANGE_ASSIGNMENT')} onClick={() => onEdit(row, 'assignment')}>调整分工</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="admin-cc-mobile-list">{rows.map((row) => <article key={row.id}><header><strong>第 {row.stepNumber ?? '—'} 步 · {row.nodeName}</strong><RiskBadge risk={row.riskLevel} /></header><p>{row.project.name}</p><dl><div><dt>负责人</dt><dd>{row.assignee?.name ?? '待分配'}</dd></div><div><dt>截止</dt><dd>{formatDate(row.plannedDueAt)}</dd></div><div><dt>材料</dt><dd>{row.materialProgress.completed}/{row.materialProgress.required}</dd></div></dl><small>请在桌面端完成计划或分工调整。</small></article>)}</div>
    </>
  );
}

function OrganizationTable({ response, onUserEdit }: { response: AdminOrganizationResponse; onUserEdit: (row: Record<string, unknown>) => void }) {
  if (!response.items.length) return <AdminEmpty title="没有组织记录" description="当前筛选范围没有数据。" />;
  const headers = response.tab === 'users'
    ? ['姓名', '飞书身份', '部门', '角色', '状态', '项目 / 任务', '版本', '操作']
    : response.tab === 'departments'
      ? ['部门', '编码', '上级部门', '负责人', '人数', '活跃任务', '配置节点', '状态']
      : ['项目', '成员', '部门', '项目职责', '关系', '当前任务', '有效期', '版本', '操作'];
  return (
    <>
      <div className="admin-cc-table-wrap">
        <table className="admin-cc-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{response.items.map((row) => response.tab === 'users'
            ? <tr key={row.id}>
                <td><strong>{readText(row.name)}</strong><small>{readText(row.username)}</small></td>
                <td>{readText(row.feishuUserId) || '待同步'}</td>
                <td>{readNestedText(row.department, 'name') || '未归属'}</td>
                <td>{readArray(row.roles).map((role) => readNestedText(role, 'name')).filter(Boolean).join('、') || '无角色'}</td>
                <td><StatusBadge value={readText(row.status)} /></td>
                <td>{readNumber(row.projectCount)} / {readNumber(row.taskCount)}</td>
                <td><code>{shortVersion(readText(row.dataVersion))}</code></td>
                <td><div className="admin-cc-row-actions"><button type="button" onClick={() => onUserEdit(row)}>变更状态</button><Link href={`/admin/tasks?search=${encodeURIComponent(readText(row.name))}`}>查看任务</Link></div></td>
              </tr>
            : response.tab === 'departments'
              ? <tr key={row.id}>
                  <td><strong>{readText(row.name)}</strong><small>{readText(row.path)}</small></td>
                  <td>{readText(row.code)}</td><td>{readNestedText(row.parent, 'name') || '根部门'}</td>
                  <td>{readNestedText(row.departmentLead, 'name') || '待设置'}</td><td>{readNumber(row.memberCount)}</td>
                  <td>{readNumber(row.activeTaskCount)}</td><td>{readNumber(row.configuredNodeCount)}</td><td>{readBoolean(row.isActive) ? '启用' : '停用'}</td>
                </tr>
              : <tr key={row.id}>
                  <td>{readNestedText(row.project, 'name')}</td><td><strong>{readNestedText(row.user, 'name')}</strong></td>
                  <td>{readNestedText(readRecord(row.user).department, 'name') || '未归属'}</td><td>{readText(row.responsibility) || '成员'}</td>
                  <td>{memberRelations(row)}</td><td>{readNumber(row.activeTaskCount)}</td><td>{formatDate(readText(row.validFrom))}</td><td><code>{shortVersion(readText(row.dataVersion))}</code></td>
                  <td><Link href={`/projects/${encodeURIComponent(readNestedText(row.project, 'id'))}`}>打开成员管理</Link></td>
                </tr>)}</tbody>
        </table>
      </div>
      <div className="admin-cc-mobile-list">{response.items.map((row) => <article key={row.id}><header><strong>{readText(row.name) || readNestedText(row.user, 'name') || readNestedText(row.project, 'name')}</strong><StatusBadge value={readText(row.status) || (readBoolean(row.isActive) ? 'ACTIVE' : 'INACTIVE')} /></header><p>{readNestedText(row.department, 'name') || readText(row.code) || readText(row.responsibility)}</p><small>请在桌面端完成组织治理操作。</small></article>)}</div>
    </>
  );
}

function AssignmentsTable({ response, projectId, onProjectChange }: { response: AdminAssignmentResponse; projectId: string; onProjectChange: (value: string) => void }) {
  return (
    <div>
      <div className="admin-cc-inline-filter"><label>项目<select value={projectId} onChange={(event) => onProjectChange(event.target.value)}>{response.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {displayProjectCode(project.code)}</option>)}</select></label><span>项目分工版本：{response.projectVersion ?? '尚未生成'}</span></div>
      {!response.items.length ? <AdminEmpty title="没有可展示的分工" description="请先创建项目。" /> : <div className="admin-cc-table-wrap"><table className="admin-cc-table"><thead><tr><th>步骤</th><th>工序</th><th>主责部门</th><th>建议负责人</th><th>协同人员</th><th>评审人员</th><th>匹配状态</th><th>分配来源</th></tr></thead><tbody>
        {response.items.map((item, index) => <tr key={`${readText(item.nodeCode)}-${index}`}>
          <td>{readNumber(item.stepNumber) || index + 1}</td><td><strong>{readText(item.stepName) || readText(item.nodeName) || readText(item.name)}</strong><small>{readText(item.nodeCode)}</small></td>
          <td>{readNestedText(item.primaryDepartment, 'name') || '待确定'}</td><td>{readNestedText(item.suggestedOwner, 'name') || '待分配'}</td>
          <td>{namesFromUnknown(item.collaboratorDepartments)}<small>{namesFromUnknown(item.collaborators)}</small></td><td>{namesFromUnknown(item.reviewers)}</td>
          <td><StatusBadge value={readText(item.assignmentStatus) || 'UNASSIGNED'} /><small>{readText(item.unassignedReason)}</small></td><td>{assignmentSourceLabel(readText(item.assignmentSource) || 'UNASSIGNED')}</td>
        </tr>)}
      </tbody></table></div>}
      <p className="admin-cc-mobile-note">移动端提供只读分工总览；请在桌面端完成受控调整。</p>
    </div>
  );
}

function PermissionsTable({ response }: { response: AdminPermissionResponse }) {
  return (
    <div>
      <div className="admin-cc-policy-note"><strong>权限由后端强制执行</strong><span>前端隐藏按钮不能替代权限校验；系统角色不可在此直接改写。</span></div>
      <div className="admin-cc-table-wrap"><table className="admin-cc-table admin-cc-matrix"><thead><tr><th>角色</th><th>用户数</th>{response.actions.map((action) => <th key={action.code}>{action.label}</th>)}<th>锁定</th></tr></thead><tbody>
        {response.roles.map((role) => <tr key={role.id}><td><strong>{role.name}</strong><small>{role.code}</small></td><td>{role.userCount}</td>{response.actions.map((action) => {
          const permission = role.permissions.find((item) => item.code === action.code);
          return <td key={action.code}><span className={permission?.granted ? 'admin-cc-granted' : 'admin-cc-denied'}>{permission?.granted ? '允许' : '禁止'}</span><small>{permission?.scope}</small></td>;
        })}<td>{role.locked ? '系统锁定' : '可扩展角色'}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function WorkflowTable({ response, onVersion }: { response: AdminWorkflowResponse; onVersion: (row: AdminWorkflowResponse['templates'][number]) => void }) {
  const firstTemplate = response.templates[0];
  return (
    <div className="admin-cc-stack">
      <section><div className="admin-cc-section-title"><div><h2>模板版本</h2><p>新版本只影响未来项目，运行中项目继续使用原版本。</p></div>{firstTemplate ? <button type="button" className="admin-cc-button admin-cc-button--primary admin-cc-desktop-action" onClick={() => onVersion(firstTemplate)}>新建模板版本</button> : null}</div>
        <div className="admin-cc-table-wrap"><table className="admin-cc-table"><thead><tr><th>模板</th><th>版本</th><th>状态</th><th>默认</th><th>生效日期</th><th>数据版本</th></tr></thead><tbody>{response.templates.map((template) => <tr key={template.id}><td><strong>{template.name}</strong><small>{template.code}</small></td><td>{template.version}</td><td><StatusBadge value={readText(template.status)} /></td><td>{readBoolean(template.isDefault) ? '是' : '否'}</td><td>{formatDate(readText(template.effectiveAt))}</td><td><code>{shortVersion(readText(template.dataVersion))}</code></td></tr>)}</tbody></table></div>
      </section>
      <section><div className="admin-cc-section-title"><div><h2>18 节点参数</h2><p>拓扑、专项门禁和关键规则由服务端锁定。</p></div></div>
        <div className="admin-cc-table-wrap"><table className="admin-cc-table"><thead><tr><th>步骤</th><th>节点</th><th>工期</th><th>主线</th><th>评审</th><th>必交材料</th><th>参数来源</th><th>规则状态</th></tr></thead><tbody>{response.nodes.map((node) => <tr key={node.id}><td>{node.step}</td><td><strong>{node.name}</strong><small>{node.nodeCode}</small></td><td>{readNumber(node.durationValue)} {readText(node.durationType)}</td><td>{readBoolean(node.isMain) ? '是' : '非阻塞'}</td><td>{readBoolean(node.isReviewNode) ? '评审节点' : '普通节点'}</td><td>{namesFromUnknown(node.requiredMaterials)}</td><td>模板默认</td><td>{readBoolean(node.lockedRule) ? <span title={readText(node.lockReason)}>服务端锁定</span> : '版本化维护'}</td></tr>)}</tbody></table></div>
      </section>
      <p className="admin-cc-mobile-note">移动端只读；模板版本管理请使用桌面端。</p>
    </div>
  );
}

function DictionariesTable({ response, onEdit }: { response: AdminDictionaryResponse; onEdit: (row: AdminDictionaryResponse['categories'][number]['items'][number]) => void }) {
  return (
    <div className="admin-cc-stack">
      {response.categories.map((category) => <section key={category.category}><div className="admin-cc-section-title"><div><h2>{category.category}</h2><p>{category.items.length} 个真实字典项</p></div></div><div className="admin-cc-table-wrap"><table className="admin-cc-table"><thead><tr><th>编码</th><th>名称</th><th>顺序</th><th>状态</th><th>保护</th><th>数据版本</th><th>操作</th></tr></thead><tbody>{category.items.map((item) => <tr key={item.id}><td><code>{item.code}</code></td><td>{item.name}</td><td>{item.sortOrder}</td><td>{item.isActive ? '启用' : '停用'}</td><td>{item.locked ? '系统保留' : '可维护'}</td><td><code>{shortVersion(item.dataVersion)}</code></td><td><button type="button" disabled={item.locked} onClick={() => onEdit(item)}>{item.locked ? '已锁定' : '编辑'}</button></td></tr>)}</tbody></table></div></section>)}
      <section><div className="admin-cc-section-title"><div><h2>系统参数</h2><p>收费标准、流程控制等核心参数只读展示。</p></div></div><div className="admin-cc-table-wrap"><table className="admin-cc-table"><thead><tr><th>分类</th><th>编码</th><th>类型</th><th>值</th><th>说明</th><th>状态</th></tr></thead><tbody>{response.parameters.map((parameter) => <tr key={parameter.id}><td>{readText(parameter.category)}</td><td><code>{readText(parameter.code)}</code></td><td>{readText(parameter.valueType)}</td><td>{formatUnknown(parameter.value)}</td><td>{readText(parameter.description)}</td><td>{readBoolean(parameter.locked) ? '服务端锁定' : '只读'}</td></tr>)}</tbody></table></div></section>
      <p className="admin-cc-mobile-note">移动端只读；字典维护请使用桌面端。</p>
    </div>
  );
}

function AdminEditDialog({ state, onClose, onSuccess }: { state: Exclude<DialogState, null>; onClose: () => void; onSuccess: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string | boolean>>(() => initialForm(state));
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<AdminOrganizationResponse | null>(null);
  const [departments, setDepartments] = useState<AdminOrganizationResponse | null>(null);

  useEffect(() => {
    if (state.kind === 'task' && state.mode === 'assignment') {
      void Promise.all([
        fetchAdminOrganization({
          tab: 'members',
          projectId: state.row.project.id,
          pageSize: 100,
        }),
        fetchAdminOrganization({ tab: 'departments', pageSize: 100 }),
      ]).then(([members, departmentRows]) => {
        setDirectory(members);
        setDepartments(departmentRows);
      }).catch(() => {
        setDirectory(null);
        setDepartments(null);
      });
    } else if (state.kind === 'batch' && state.mode === 'assignment') {
      void fetchAdminOrganization({ tab: 'departments', pageSize: 100 })
        .then(setDepartments)
        .catch(() => setDepartments(null));
    }
  }, [state]);

  const title = dialogTitle(state);
  const isPreviewCommand =
    state.kind === 'task' || state.kind === 'batch' || state.kind === 'import';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (state.kind === 'project') {
        await updateAdminProject(state.row.id, {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: state.row.dataVersion,
          name: String(form.name),
          vehicleModel: String(form.vehicleModel),
          colorName: String(form.colorName),
          plannedEndDate: String(form.plannedEndDate) || undefined,
          reason: String(form.reason),
        });
        await onSuccess('项目基础信息已更新，状态机字段保持不变。');
      } else if (state.kind === 'user') {
        await updateAdminUserStatus(state.row.id as string, {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: readText(state.row.dataVersion),
          status: String(form.status),
          reason: String(form.reason),
        });
        await onSuccess('用户状态已更新并写入审计日志。');
      } else if (state.kind === 'dictionary') {
        await updateAdminDictionary(state.row.id, {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: state.row.dataVersion,
          name: String(form.name),
          sortOrder: Number(form.sortOrder),
          isActive: Boolean(form.isActive),
          reason: String(form.reason),
        });
        await onSuccess('字典项已更新并写入审计日志。');
      } else if (state.kind === 'template') {
        await createAdminTemplateVersion(state.row.id, {
          idempotencyKey: crypto.randomUUID(),
          version: String(form.version),
          effectiveAt: new Date(String(form.effectiveAt)).toISOString(),
          description: String(form.description),
          reason: String(form.reason),
        });
        await onSuccess('新模板版本已创建；运行中项目未被改写。');
      } else if (state.kind === 'batch') {
        const body = {
          tasks: state.rows.map((row) => ({
            taskId: row.id,
            taskVersion: row.taskVersion,
          })),
          operation: state.mode === 'schedule' ? 'SCHEDULE' : 'ASSIGNMENT',
          ...(state.mode === 'schedule'
            ? {
                plannedDueAt: new Date(
                  String(form.plannedDueAt),
                ).toISOString(),
              }
            : {
                primaryDepartmentId:
                  String(form.primaryDepartmentId) || undefined,
              }),
          reason: String(form.reason),
        };
        if (!preview) {
          setPreview(await previewAdminBatchTasks(body));
        } else {
          await updateAdminBatchTasks({
            ...body,
            idempotencyKey: crypto.randomUUID(),
            acknowledgedConsequences: true,
          });
          await onSuccess(
            `已原子完成 ${state.rows.length} 条工序的批量调整并写入审计日志。`,
          );
        }
      } else if (state.kind === 'import') {
        const body = {
          csv: state.csv,
          reason: String(form.reason),
        };
        if (!preview) {
          setPreview(await previewAdminTaskImport(body));
        } else {
          await applyAdminTaskImport({
            ...body,
            idempotencyKey: crypto.randomUUID(),
            acknowledgedConsequences: true,
          });
          await onSuccess('正式模板中的计划日期已原子导入并写入审计日志。');
        }
      } else if (state.mode === 'schedule') {
        const body = {
          taskVersion: state.row.taskVersion,
          plannedDueAt: new Date(String(form.plannedDueAt)).toISOString(),
          scope: String(form.scope),
          reason: String(form.reason),
        };
        if (!preview) {
          setPreview(await previewAdminSchedule(state.row.id, body));
        } else {
          await updateAdminSchedule(state.row.id, {
            ...body,
            idempotencyKey: crypto.randomUUID(),
            acknowledgedConsequences: true,
          });
          await onSuccess('工序计划已更新，相关影响与审计记录已保存。');
        }
      } else {
        const body = {
          taskVersion: state.row.taskVersion,
          primaryDepartmentId: String(form.primaryDepartmentId) || undefined,
          ownerUserId: String(form.ownerUserId) || undefined,
          collaboratorUserIds: [],
          reviewerUserIds: [],
          reason: String(form.reason),
          confirmInProgress: state.row.status === 'IN_PROGRESS',
        };
        if (!preview) {
          setPreview(await previewAdminAssignment(state.row.id, body));
        } else {
          await updateAdminAssignment(state.row.id, {
            ...body,
            idempotencyKey: crypto.randomUUID(),
            acknowledgedConsequences: true,
          });
          await onSuccess('工序分工已更新，负责人来自服务端候选与分配规则。');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '操作失败。');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-cc-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-cc-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <header><div><p>受控管理操作</p><h2 id="admin-dialog-title">{title}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="admin-cc-dialog__body">
            <div className="admin-cc-safety-note"><strong>不会直接修改流程状态</strong><span>服务端将校验权限、数据版本、业务边界和幂等键，并写入审计日志。</span></div>
            {state.kind === 'project' ? <>
              <Field label="项目名称"><input required value={String(form.name)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, name: value })); }} /></Field>
              <Field label="车型"><input value={String(form.vehicleModel)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, vehicleModel: value })); }} /></Field>
              <Field label="颜色名称"><input value={String(form.colorName)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, colorName: value })); }} /></Field>
              <Field label="计划结束日期"><input type="date" value={String(form.plannedEndDate)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, plannedEndDate: value })); }} /></Field>
            </> : null}
            {state.kind === 'task' && state.mode === 'schedule' ? <>
              <Field label="新计划截止日期"><input required type="datetime-local" value={String(form.plannedDueAt)} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, plannedDueAt: value })); setPreview(null); }} /></Field>
              <Field label="影响范围"><select value={String(form.scope)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, scope: value })); setPreview(null); }}><option value="CURRENT_TASK_ONLY">仅当前工序</option><option value="CURRENT_PROJECT_FUTURE_TASKS">当前项目后续工序</option></select></Field>
            </> : null}
            {state.kind === 'batch' ? <>
              <div className="admin-cc-batch-summary"><strong>将修改 {state.rows.length} 条工序</strong><span>未开始 {state.rows.filter((row) => row.status === 'PENDING' || row.status === 'READY').length} 条 · 进行中 {state.rows.filter((row) => row.status === 'IN_PROGRESS').length} 条 · 已完成 {state.rows.filter((row) => row.status === 'COMPLETED').length} 条</span></div>
              {state.mode === 'schedule' ? <Field label="统一计划截止时间"><input required type="datetime-local" value={String(form.plannedDueAt)} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, plannedDueAt: value })); setPreview(null); }} /></Field> : <Field label="统一主责部门"><select value={String(form.primaryDepartmentId)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, primaryDepartmentId: value })); setPreview(null); }}><option value="">由每条工序的服务端规则决定</option>{departments?.items.map((department) => <option key={department.id} value={department.id}>{readText(department.name)}</option>)}</select></Field>}
            </> : null}
            {state.kind === 'import' ? <div className="admin-cc-batch-summary"><strong>已选择正式导入文件</strong><span>{state.fileName} · {new Blob([state.csv]).size} 字节</span><small>第一步只执行 dry-run；所有行通过后才允许确认写入。</small></div> : null}
            {state.kind === 'task' && state.mode === 'assignment' ? <>
              <Field label="新主责部门"><select value={String(form.primaryDepartmentId)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, primaryDepartmentId: value, ownerUserId: '' })); setPreview(null); }}><option value="">保持或由服务端规则确定</option>{departments?.items.map((department) => <option key={department.id} value={department.id}>{readText(department.name)}</option>)}</select></Field>
              <Field label="新负责人"><select value={String(form.ownerUserId)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, ownerUserId: value })); setPreview(null); }}><option value="">由后端规则建议</option>{directory?.items.map((member) => {
                const user = readRecord(member.user);
                return <option key={member.id} value={readText(user.id)}>{readText(user.name)} · {readNestedText(user.department, 'name') || '未归属'} · {readText(member.responsibility) || '项目成员'}</option>;
              })}</select></Field>
            </> : null}
            {state.kind === 'user' ? <Field label="用户状态"><select value={String(form.status)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, status: value })); }}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option><option value="LOCKED">锁定</option></select></Field> : null}
            {state.kind === 'dictionary' ? <>
              <Field label="显示名称"><input required value={String(form.name)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, name: value })); }} /></Field>
              <Field label="排序"><input type="number" value={String(form.sortOrder)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, sortOrder: value })); }} /></Field>
              <label className="admin-cc-checkbox"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => { const checked = event.currentTarget.checked; setForm((current) => ({ ...current, isActive: checked })); }} />启用此字典项</label>
            </> : null}
            {state.kind === 'template' ? <>
              <Field label="新版本号"><input required value={String(form.version)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, version: value })); }} placeholder="例如 2026.08" /></Field>
              <Field label="计划生效时间"><input required type="datetime-local" value={String(form.effectiveAt)} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, effectiveAt: value })); }} /></Field>
              <Field label="版本说明"><textarea value={String(form.description)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, description: value })); }} /></Field>
            </> : null}
            <Field label="变更原因"><textarea required minLength={3} value={String(form.reason)} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, reason: value })); if (isPreviewCommand) setPreview(null); }} placeholder="说明业务原因和预期结果" /></Field>
            {preview ? <div className="admin-cc-preview"><strong>影响预览</strong><dl>{previewRows(preview).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>确认后将按以上服务端计算结果执行；前端不会提交下一节点或状态。</p></div> : null}
            {error ? <div className="admin-cc-alert admin-cc-alert--error">{error}</div> : null}
          </div>
          <footer><button type="button" className="admin-cc-button admin-cc-button--quiet" onClick={onClose}>取消</button><button type="submit" className="admin-cc-button admin-cc-button--primary" disabled={busy || Boolean(isPreviewCommand && preview && 'canApply' in preview && !readBoolean(preview.canApply))}>{busy ? '处理中…' : isPreviewCommand && !preview ? '查看影响预览' : isPreviewCommand && preview && 'canApply' in preview && !readBoolean(preview.canApply) ? '条件未满足' : isPreviewCommand ? '确认执行变更' : '确认保存'}</button></footer>
        </form>
      </section>
    </div>
  );
}

function TaskPresets({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const views: Array<[string, string]> = [['ALL', '全部'], ['OVERDUE', '已逾期'], ['DUE_SOON', '即将到期'], ['UNASSIGNED', '待分配'], ['BLOCKED', '有阻塞'], ['WAITING_REVIEW', '等待评审'], ['MISSING_MATERIAL', '缺材料'], ['MONTHLY_REVIEW', '月度评审'], ['COMPLETED', '已完成']];
  return <div className="admin-cc-presets" role="tablist" aria-label="工序快捷视图">{views.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'is-active' : undefined} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function OrganizationTabs({ value, onChange }: { value: 'users' | 'departments' | 'members'; onChange: (value: 'users' | 'departments' | 'members') => void }) {
  return <div className="admin-cc-presets" role="tablist" aria-label="组织数据类型">{([['users', '系统用户'], ['departments', '公司部门'], ['members', '项目成员']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'is-active' : undefined} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (page: number) => void }) {
  return <div className="admin-cc-pagination"><span>共 {total} 条 · 第 {page}/{totalPages} 页</span><div><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button><button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="admin-cc-field"><span>{label}</span>{children}</label>;
}

function AdminEmpty({ title, description }: { title: string; description: string }) {
  return <div className="admin-cc-empty"><strong>{title}</strong><p>{description}</p></div>;
}

function AdminTableSkeleton() {
  return <div className="admin-cc-skeleton" aria-label="正在加载真实后台数据">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>;
}

function RiskBadge({ risk }: { risk: string }) {
  const labels: Record<string, string> = { NORMAL: '正常', HIGH: '高风险', MEDIUM: '需关注', BLOCKED: '有阻塞', OVERDUE: '已逾期', MATERIAL_MISSING: '缺材料' };
  return <span className={`admin-cc-badge admin-cc-badge--${risk.toLowerCase().replaceAll('_', '-')}`}>{labels[risk] ?? risk}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`admin-cc-status admin-cc-status--${value.toLowerCase()}`}>{statusLabel(value)}</span>;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ACTIVE: '启用',
    INACTIVE: '停用',
    LOCKED: '锁定',
    PENDING: '待开始',
    READY: '可开始',
    IN_PROGRESS: '进行中',
    COMPLETED: '已完成',
    APPROVED: '已通过',
    REJECTED: '已拒绝',
    RETURNED: '已退回',
    UNASSIGNED: '待分配',
    ASSIGNED: '已分配',
    MATCHED: '已匹配',
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ON_HOLD: '已暂停',
    CANCELLED: '已取消',
  };

  return labels[value] ?? value;
}

function assignmentSourceLabel(value: string) {
  const labels: Record<string, string> = {
    TASK_OVERRIDE: '任务人工指定',
    PROJECT_NODE_OVERRIDE: '项目节点专属负责人',
    PROJECT_DEPARTMENT_LEAD: '项目部门负责人',
    PROJECT_DEFAULT_ASSIGNEE: '项目默认执行人',
    SINGLE_ELIGIBLE_MEMBER: '部门唯一符合成员',
    UNASSIGNED: '待分配',
  };

  return labels[value] ?? value;
}

function initialForm(state: Exclude<DialogState, null>): Record<string, string | boolean> {
  if (state.kind === 'project') return {
    name: state.row.name,
    vehicleModel: state.row.vehicleModel ?? '',
    colorName: state.row.color?.name ?? '',
    plannedEndDate: toDateInput(state.row.plannedEndDate),
    reason: '',
  };
  if (state.kind === 'task') return {
    plannedDueAt: toDateTimeInput(state.row.plannedDueAt),
    scope: 'CURRENT_TASK_ONLY',
    primaryDepartmentId: state.row.primaryDepartment?.id ?? '',
    ownerUserId: state.row.assignee?.id ?? '',
    reason: '',
  };
  if (state.kind === 'batch') return {
    plannedDueAt: toDateTimeInput(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ),
    primaryDepartmentId: '',
    reason: '',
  };
  if (state.kind === 'import') return { reason: '' };
  if (state.kind === 'user') return { status: readText(state.row.status) || 'ACTIVE', reason: '' };
  if (state.kind === 'dictionary') return { name: state.row.name, sortOrder: String(state.row.sortOrder), isActive: state.row.isActive, reason: '' };
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { version: '', effectiveAt: toDateTimeInput(tomorrow.toISOString()), description: '', reason: '' };
}

function dialogTitle(state: Exclude<DialogState, null>) {
  if (state.kind === 'project') return `编辑项目：${state.row.name}`;
  if (state.kind === 'task') return state.mode === 'schedule' ? `调整计划：${state.row.nodeName}` : `调整分工：${state.row.nodeName}`;
  if (state.kind === 'batch') return state.mode === 'schedule' ? `批量调整 ${state.rows.length} 条工序计划` : `批量调整 ${state.rows.length} 条工序分工`;
  if (state.kind === 'import') return '导入工序计划日期';
  if (state.kind === 'user') return `变更用户状态：${readText(state.row.name)}`;
  if (state.kind === 'dictionary') return `编辑字典项：${state.row.name}`;
  return `基于 ${state.row.version} 创建新版本`;
}

function hasSectionData(section: AdminControlSection, data: LoadState) {
  if (section === 'workflow-templates') return Boolean(data.workflow);
  return Boolean(data[section]);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '未设置';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function displayProjectCode(value: string) {
  if (/^DEMO-ACTIVE-/i.test(value)) return '演示项目（进行中）';
  if (/^DEMO-(COMPLETED|CLOSED)-/i.test(value)) return '演示项目（已完成）';
  return value;
}

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function toDateTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function shortVersion(value: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '—';
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value) || 0;
}

function readBoolean(value: unknown) {
  return value === true;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readNestedText(value: unknown, key: string) {
  return readText(readRecord(value)[key]);
}

function namesFromUnknown(value: unknown) {
  if (!Array.isArray(value) || !value.length) return '—';
  return value.map((item) => typeof item === 'string' ? item : readNestedText(item, 'name')).filter(Boolean).join('、') || '—';
}

function memberRelations(row: Record<string, unknown>) {
  const relations = [
    readBoolean(row.isProjectOwner) ? '项目负责人' : '',
    readBoolean(row.isDepartmentLead) ? '部门负责人' : '',
    readBoolean(row.isDefaultExecutor) ? '默认执行人' : '',
    readBoolean(row.isReviewer) ? '评审人' : '',
  ].filter(Boolean);
  return relations.join('、') || readText(row.memberType) || '项目成员';
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
    if (value in PREVIEW_VALUE_LABELS) return PREVIEW_VALUE_LABELS[value] ?? value;
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.map(formatUnknown).join('；') : '无';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string' && record.name) return record.name;
    const entries = Object.entries(record);
    return entries.length ? entries.slice(0, 6).map(([key, item]) => `${humanizeKey(key)}：${formatUnknown(item)}`).join('；') : '无';
  }
  return String(value);
}

function humanizeKey(key: string) {
  const labels: Record<string, string> = {
    canApply: '是否可执行',
    blockingReasons: '阻断原因',
    current: '当前值',
    proposed: '调整后',
    impact: '影响范围',
    affectedTasks: '受影响工序',
    assignmentSource: '分配来源',
    writePerformed: '已执行写入',
    task: '当前工序',
    before: '调整前',
    after: '调整后',
    projectName: '项目',
    nodeName: '工序',
    status: '状态',
    assignee: '负责人',
    plannedStartAt: '计划开始',
    plannedDueAt: '计划截止',
    overdueDays: '逾期天数',
    projectPlannedEndDate: '项目计划完成',
    workdayDifference: '日期变化',
    scope: '作用范围',
    downstreamTasks: '下游工序',
    beforeDueAt: '原截止时间',
    afterDueAt: '新截止时间',
    manuallyOverridden: '已有人工覆盖',
    operation: '操作类型',
    total: '工序总数',
    applicableCount: '可执行数量',
    rejectedCount: '被阻断数量',
    items: '逐条影响',
    taskId: '工序记录',
    preview: '单条影响',
    primaryDepartmentId: '主责部门',
    ownerUserId: '负责人',
    previousOwnerLosesTask: '原负责人减少任务',
    newOwnerGainsTask: '新负责人增加任务',
    historyPreserved: '历史记录保留',
    primaryDepartment: '主责部门',
    owner: '负责人',
    collaboratorUserIds: '协同人员',
    reviewerUserIds: '评审人员',
    candidates: '候选人员',
  };
  return labels[key] ?? key;
}

const PREVIEW_VALUE_LABELS: Record<string, string> = {
  CURRENT_TASK_ONLY: '仅当前工序',
  CURRENT_PROJECT_FUTURE_TASKS: '当前项目尚未开始的后续工序',
  TASK_OVERRIDE: '任务人工指定',
  PROJECT_NODE_OVERRIDE: '项目节点专属负责人',
  PROJECT_DEPARTMENT_LEAD: '项目部门负责人',
  PROJECT_DEFAULT_ASSIGNEE: '项目默认执行人',
  SINGLE_ELIGIBLE_MEMBER: '部门唯一符合成员',
  UNASSIGNED: '待分配',
  READY: '可开始',
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  SCHEDULE: '计划调整',
  ASSIGNMENT: '分工调整',
};

function previewRows(preview: Record<string, unknown>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if ('canApply' in preview) {
    rows.push(['是否可执行', readBoolean(preview.canApply) ? '可以执行' : '暂时不能执行']);
  }
  if ('blockingReasons' in preview) {
    rows.push(['阻断原因', formatUnknown(preview.blockingReasons)]);
  }
  const task = readRecord(preview.task);
  if (Object.keys(task).length) {
    rows.push([
      '当前工序',
      [readText(task.projectName), readText(task.nodeName), formatUnknown(task.status)]
        .filter(Boolean)
        .join(' · '),
    ]);
  }
  if ('before' in preview) rows.push(['调整前', formatUnknown(preview.before)]);
  if ('after' in preview) rows.push(['调整后', formatUnknown(preview.after)]);
  if ('impact' in preview) rows.push(['影响范围', formatUnknown(preview.impact)]);
  for (const [key, value] of Object.entries(preview)) {
    if (['canApply', 'blockingReasons', 'task', 'before', 'after', 'impact', 'writePerformed'].includes(key)) continue;
    rows.push([humanizeKey(key), formatUnknown(value)]);
  }
  rows.push(['本次预览', readBoolean(preview.writePerformed) ? '已执行写入' : '尚未写入任何业务数据']);
  return rows.slice(0, 10);
}
