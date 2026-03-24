'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import {
  fetchProjects,
  fetchUserDirectory,
  formatDate,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type DirectoryUser,
  type ProjectListResponse,
  type WorkflowNodeCode,
} from '../lib/projects-client';

type FilterState = {
  status: string;
  currentNodeCode: string;
  ownerUserId: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: FilterState = {
  status: '',
  currentNodeCode: '',
  ownerUserId: '',
  priority: '',
  dateFrom: '',
  dateTo: '',
};

export function ProjectsListClient() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [listResponse, setListResponse] = useState<ProjectListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    setIsLoading(true);
    setError(null);

    try {
      const [projects, users] = await Promise.all([
        fetchProjects({ page: 1, pageSize: 10 }),
        fetchUserDirectory(),
      ]);

      setListResponse(projects);
      setDirectoryUsers(users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProjects(page: number) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchProjects({
        page,
        pageSize: listResponse?.pageSize ?? 10,
        status: filters.status as '' | 'DRAFT' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED',
        currentNodeCode: filters.currentNodeCode as WorkflowNodeCode | '',
        ownerUserId: filters.ownerUserId,
        priority: filters.priority as '' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      setListResponse(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterChange(key: keyof FilterState, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProjects(1);
  }

  async function handleResetFilters() {
    setFilters(DEFAULT_FILTERS);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchProjects({
        page: 1,
        pageSize: listResponse?.pageSize ?? 10,
      });

      setListResponse(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  const nodeOptions = listResponse?.nodeOptions ?? [];
  const hasItems = (listResponse?.items.length ?? 0) > 0;

  return (
    <div className="page-stack">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Project List</p>
            <h2 className="section-title">项目筛选</h2>
            <p className="muted">支持按状态、当前阶段、负责人、优先级和时间范围过滤。</p>
          </div>
          <Link href="/projects/new" className="button button-primary">
            新建项目
          </Link>
        </div>
        <form className="filters-grid" onSubmit={handleApplyFilters}>
          <label className="field">
            <span>状态</span>
            <select
              value={filters.status}
              onChange={(event) => handleFilterChange('status', event.target.value)}
            >
              <option value="">全部</option>
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>当前阶段</span>
            <select
              value={filters.currentNodeCode}
              onChange={(event) => handleFilterChange('currentNodeCode', event.target.value)}
            >
              <option value="">全部</option>
              {nodeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>负责人</span>
            <select
              value={filters.ownerUserId}
              onChange={(event) => handleFilterChange('ownerUserId', event.target.value)}
            >
              <option value="">全部</option>
              {directoryUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>优先级</span>
            <select
              value={filters.priority}
              onChange={(event) => handleFilterChange('priority', event.target.value)}
            >
              <option value="">全部</option>
              {PROJECT_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>开始日期</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => handleFilterChange('dateFrom', event.target.value)}
            />
          </label>
          <label className="field">
            <span>结束日期</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => handleFilterChange('dateTo', event.target.value)}
            />
          </label>
          <div className="inline-actions">
            <button type="submit" className="button button-primary">
              应用筛选
            </button>
            <button type="button" className="button button-secondary" onClick={handleResetFilters}>
              重置
            </button>
          </div>
        </form>
      </section>

      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Paginated Projects</p>
            <h2 className="section-title">项目列表</h2>
            <p className="muted">
              {listResponse
                ? `共 ${listResponse.total} 个项目，当前第 ${listResponse.page} / ${listResponse.totalPages} 页。`
                : '正在加载项目数据。'}
            </p>
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {isLoading ? <p className="muted">正在加载项目列表…</p> : null}
        {!isLoading && !hasItems ? (
          <div className="empty-state">
            <strong>暂无项目</strong>
            <p>当前筛选条件下没有项目记录，可以先创建一个项目。</p>
          </div>
        ) : null}
        {!isLoading && hasItems && listResponse ? (
          <>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>状态</th>
                    <th>当前节点</th>
                    <th>负责人</th>
                    <th>优先级</th>
                    <th>目标日期</th>
                    <th>风险等级</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {listResponse.items.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{project.name}</strong>
                          <span>{project.code}</span>
                        </div>
                      </td>
                      <td>{getProjectStatusLabel(project.status)}</td>
                      <td>{project.currentNodeName ?? '未开始'}</td>
                      <td>{project.ownerName ?? '未设置'}</td>
                      <td>{getProjectPriorityLabel(project.priority)}</td>
                      <td>{formatDate(project.targetDate)}</td>
                      <td>
                        <span className={`status-pill status-pill-${project.riskLevel.toLowerCase()}`}>
                          {getProjectPriorityLabel(project.riskLevel)}
                        </span>
                      </td>
                      <td>
                        <Link href={`/projects/${project.id}/overview`} className="table-link">
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <button
                type="button"
                className="button button-secondary"
                disabled={listResponse.page <= 1 || isLoading}
                onClick={() => void loadProjects(listResponse.page - 1)}
              >
                上一页
              </button>
              <span className="muted">
                第 {listResponse.page} / {listResponse.totalPages} 页
              </span>
              <button
                type="button"
                className="button button-secondary"
                disabled={listResponse.page >= listResponse.totalPages || isLoading}
                onClick={() => void loadProjects(listResponse.page + 1)}
              >
                下一页
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
