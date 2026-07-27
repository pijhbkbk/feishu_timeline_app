'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState, type FormEvent } from 'react';

import { formatBusinessCode, formatOptionalBusinessCode } from '../lib/business-code';
import {
  fetchProjects,
  fetchUserDirectory,
  formatDate,
  getProjectPriorityLabel,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type DirectoryUser,
  type ProjectListItem,
  type ProjectListResponse,
  type ProjectListView,
  type WorkflowNodeCode,
} from '../lib/projects-client';
import { useAuth } from './auth-provider';
import { R22Kpi, R22ProgressBar, R22StatusBadge } from './r22-ui';

type FilterState = {
  keyword: string;
  status: string;
  currentNodeCode: string;
  ownerUserId: string;
  ownerDepartmentId: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  keyword: '',
  status: '',
  currentNodeCode: '',
  ownerUserId: '',
  ownerDepartmentId: '',
  priority: '',
  dateFrom: '',
  dateTo: '',
};

const QUICK_VIEWS: Array<{ value: ProjectListView; label: string }> = [
  { value: 'all', label: '全部项目' },
  { value: 'normal', label: '正常推进' },
  { value: 'risk', label: '存在风险' },
  { value: 'overdue', label: '已经逾期' },
  { value: 'review', label: '等待评审' },
];

export function ProjectsListClient() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view, setView] = useState<ProjectListView>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [response, setResponse] = useState<ProjectListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      setError('请先登录后查看项目数据。');
      return;
    }
    void loadInitialData();
  }, [isAuthenticated, isAuthLoading]);

  async function loadInitialData() {
    setIsLoading(true);
    setError(null);
    try {
      const [projects, users] = await Promise.all([
        fetchProjects({ page: 1, pageSize: 12, view: 'all' }),
        fetchUserDirectory(),
      ]);
      setResponse(projects);
      setDirectoryUsers(users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目看板加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProjects(nextPage = 1, nextView = view, nextFilters = filters) {
    setIsLoading(true);
    setError(null);
    try {
      setResponse(await fetchProjects({
        page: nextPage,
        pageSize: 12,
        view: nextView,
        keyword: nextFilters.keyword,
        status: nextFilters.status as '' | 'DRAFT' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED',
        currentNodeCode: nextFilters.currentNodeCode as WorkflowNodeCode | '',
        ownerUserId: nextFilters.ownerUserId,
        ownerDepartmentId: nextFilters.ownerDepartmentId,
        priority: nextFilters.priority as '' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        dateFrom: nextFilters.dateFrom,
        dateTo: nextFilters.dateTo,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目看板加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function selectView(nextView: ProjectListView) {
    setView(nextView);
    await loadProjects(1, nextView);
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProjects(1);
  }

  async function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    await loadProjects(1, view, DEFAULT_FILTERS);
  }

  const departments = useMemo(
    () => Array.from(new Map(
      directoryUsers
        .filter((user) => user.departmentId && user.departmentName)
        .map((user) => [user.departmentId!, user.departmentName!]),
    ).entries()).map(([id, name]) => ({ id, name })),
    [directoryUsers],
  );

  return (
    <div className="r22-page r22-project-board" data-testid="project-list-page">
      <header className="r22-page-hero">
        <div>
          <p className="r22-overline">项目列表</p>
          <h1>定制色开发项目</h1>
          <p>优先看清正在推进的项目、具体停滞原因和下一位责任人。</p>
        </div>
        <Link href="/projects/new" className="r22-button r22-button-primary" data-testid="create-project-button">
          新建项目
        </Link>
      </header>

      <section className="r22-kpi-grid" aria-label="项目概览">
        <R22Kpi label="活跃项目" value={response?.summary.active ?? '—'} hint="正在开发或等待恢复" tone="brand" />
        <R22Kpi label="风险项目" value={response?.summary.risk ?? '—'} hint="逾期、阻塞或高优先级" tone="danger" />
        <R22Kpi label="本周到期" value={response?.summary.dueThisWeek ?? '—'} hint="未来 7 天内到期" tone="warning" />
        <R22Kpi label="等待评审" value={response?.summary.pendingReview ?? '—'} hint="当前节点需要评审" tone="monthly" />
      </section>

      <section className="r22-board-controls">
        <div className="r22-segmented" role="tablist" aria-label="项目快速筛选">
          {QUICK_VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={view === item.value}
              className={view === item.value ? 'is-active' : undefined}
              onClick={() => void selectView(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="r22-button r22-button-secondary"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? '收起筛选' : '高级筛选'}
        </button>
      </section>

      {showAdvanced ? (
        <form className="r22-card r22-filter-panel" onSubmit={applyFilters}>
          <label className="r22-field"><span>关键词</span><input value={filters.keyword} placeholder="项目名称 / 编号 / 颜色" onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} /></label>
          <label className="r22-field"><span>状态</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">全部</option>{PROJECT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="r22-field"><span>当前工序</span><select value={filters.currentNodeCode} onChange={(event) => setFilters({ ...filters, currentNodeCode: event.target.value })}><option value="">全部</option>{response?.nodeOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="r22-field"><span>负责人</span><select value={filters.ownerUserId} onChange={(event) => setFilters({ ...filters, ownerUserId: event.target.value })}><option value="">全部</option>{directoryUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className="r22-field"><span>责任部门</span><select value={filters.ownerDepartmentId} onChange={(event) => setFilters({ ...filters, ownerDepartmentId: event.target.value })}><option value="">全部</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="r22-field"><span>优先级</span><select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">全部</option>{PROJECT_PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="r22-field"><span>计划开始</span><input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
          <label className="r22-field"><span>计划结束</span><input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
          <div className="r22-filter-actions"><button className="r22-button r22-button-primary" type="submit">应用筛选</button><button className="r22-button r22-button-secondary" type="button" onClick={() => void resetFilters()}>重置</button></div>
        </form>
      ) : null}

      {error ? <div className="r22-inline-alert"><span>{error}</span><button type="button" onClick={() => void loadProjects()}>重新加载</button></div> : null}
      {isLoading && !response ? <ProjectBoardSkeleton /> : null}
      {!isLoading && !error && response?.items.length === 0 ? (
        <section className="r22-card r22-empty-focus"><span className="r22-empty-icon">✓</span><h2>当前筛选下没有项目</h2><p>可以切换快速视图，或新建一个定制色开发项目。</p><Link href="/projects/new" className="r22-button r22-button-primary">新建项目</Link></section>
      ) : null}
      {response?.items.length ? (
        <section className="r22-project-card-list" aria-busy={isLoading}>
          {response.items.map((project) => <ProjectBoardCard key={project.id} project={project} />)}
        </section>
      ) : null}

      {response && response.totalPages > 1 ? (
        <nav className="r22-pagination" aria-label="项目分页">
          <button type="button" className="r22-button r22-button-secondary" disabled={response.page <= 1 || isLoading} onClick={() => void loadProjects(response.page - 1)}>上一页</button>
          <span>第 {response.page} / {response.totalPages} 页 · 共 {response.total} 个项目</span>
          <button type="button" className="r22-button r22-button-secondary" disabled={response.page >= response.totalPages || isLoading} onClick={() => void loadProjects(response.page + 1)}>下一页</button>
        </nav>
      ) : null}
    </div>
  );
}

export function ProjectBoardCard({ project }: { project: ProjectListItem }) {
  const tone = project.stall || project.isOverdue ? 'danger' : project.riskLevel === 'HIGH' || project.riskLevel === 'CRITICAL' ? 'warning' : 'success';
  const displayColorCode = formatOptionalBusinessCode(project.colorCode);
  return (
    <article className="r22-card r22-project-wide-card" data-testid="project-card">
      <div className="r22-project-card-main">
        <div className="r22-project-card-title">
          <div><span>{formatBusinessCode(project.code, '定制色项目')}</span><h2>{project.name}</h2><p>{project.colorName ?? '尚未关联颜色'}{displayColorCode ? ` · ${displayColorCode}` : ''}</p></div>
          <R22StatusBadge tone={tone}>{project.stall ? '需要协同' : project.isOverdue ? '已经逾期' : getProjectPriorityLabel(project.riskLevel)}</R22StatusBadge>
        </div>
        <div className="r22-project-facts">
          <div><span>当前阶段</span><strong>{project.currentNodeName ?? '尚未开始'}</strong></div>
          <div><span>当前负责人</span><strong>{project.currentTaskOwnerName ?? '待分配'}</strong></div>
          <div><span>工序截止</span><strong>{formatDate(project.currentTaskDueAt ?? project.targetDate)}</strong></div>
          <div><span>最近更新</span><strong>{formatDate(project.latestTaskUpdatedAt)}</strong></div>
        </div>
        <div className="r22-project-progress"><div><span>开发进度</span><strong>{project.progressText}</strong></div><R22ProgressBar value={project.progressPercent} label={`${project.name}完成 ${project.progressPercent}%`} /></div>
      </div>

      <aside className={`r22-project-stall ${project.stall ? 'has-risk' : ''}`}>
        {project.stall ? (
          <>
            <span>停滞原因 · {project.stall.days} 天</span>
            <strong>{project.stall.nodeName ?? project.currentNodeName ?? '当前工序'}</strong>
            <p>{project.stall.reason}</p>
            <dl>
              <div><dt>责任人</dt><dd>{project.stall.ownerName ?? '待分配'}</dd></div>
              <div><dt>协助人</dt><dd>{project.stall.helperName ?? '未指定'}</dd></div>
              <div><dt>预计解决</dt><dd>{formatDate(project.stall.expectedResolvedAt)}</dd></div>
            </dl>
          </>
        ) : (
          <><span>推进状态</span><strong>按计划进行</strong><p>当前没有逾期任务或未解决阻塞。</p></>
        )}
        <div className="r22-project-card-actions">
          <Link href={`/projects/${project.id}`} className="r22-button r22-button-primary">打开项目</Link>
        </div>
      </aside>
    </article>
  );
}

function ProjectBoardSkeleton() {
  return <section className="r22-project-card-list" aria-label="正在加载项目"><div className="r22-card r22-project-wide-card r22-skeleton-card" /><div className="r22-card r22-project-wide-card r22-skeleton-card" /></section>;
}
