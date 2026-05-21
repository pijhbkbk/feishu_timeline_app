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
import { useAuth } from './auth-provider';

type FilterState = {
  keyword: string;
  status: string;
  currentNodeCode: string;
  ownerUserId: string;
  ownerDepartmentId: string;
  isOverdue: string;
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
  isOverdue: '',
  priority: '',
  dateFrom: '',
  dateTo: '',
};

export function ProjectsListClient() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [listResponse, setListResponse] = useState<ProjectListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

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
        keyword: filters.keyword,
        status: filters.status as '' | 'DRAFT' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED',
        currentNodeCode: filters.currentNodeCode as WorkflowNodeCode | '',
        ownerUserId: filters.ownerUserId,
        ownerDepartmentId: filters.ownerDepartmentId,
        isOverdue:
          filters.isOverdue === ''
            ? ''
            : filters.isOverdue === 'true',
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
  const departmentOptions = Array.from(
    new Map(
      directoryUsers
        .filter((user) => user.departmentId && user.departmentName)
        .map((user) => [user.departmentId!, user.departmentName!]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="page-stack" data-testid="project-list-page">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目列表</p>
            <h2 className="section-title">项目筛选</h2>
            <p className="muted">按项目名称、编号、颜色、当前工序、责任部门和逾期状态快速定位项目。</p>
          </div>
          <Link href="/projects/new" className="button button-primary" data-testid="create-project-button">
            新建项目
          </Link>
        </div>
        <form className="filters-grid" onSubmit={handleApplyFilters}>
          <label className="field">
            <span>关键词</span>
            <input
              value={filters.keyword}
              onChange={(event) => handleFilterChange('keyword', event.target.value)}
              placeholder="项目名称 / 项目编号 / 颜色名称"
            />
          </label>
          <label className="field">
            <span>项目状态</span>
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
            <span>当前工序</span>
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
            <span>责任部门</span>
            <select
              value={filters.ownerDepartmentId}
              onChange={(event) => handleFilterChange('ownerDepartmentId', event.target.value)}
            >
              <option value="">全部</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>是否逾期</span>
            <select
              value={filters.isOverdue}
              onChange={(event) => handleFilterChange('isOverdue', event.target.value)}
            >
              <option value="">全部</option>
              <option value="true">只看逾期</option>
              <option value="false">排除逾期</option>
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
            <p className="eyebrow">项目管理</p>
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
        {!isLoading && error ? (
          <div className="inline-actions">
            <button type="button" className="button button-primary" onClick={() => void loadInitialData()}>
              重新加载
            </button>
            <Link href="/login" className="button button-secondary">
              登录系统
            </Link>
          </div>
        ) : null}
        {!isLoading && !error && !hasItems ? (
          <div className="empty-state">
            <strong>暂无项目</strong>
            <p>当前筛选条件下没有项目记录，可以先创建一个项目。</p>
            <Link href="/projects/new" className="button button-primary">
              新建项目
            </Link>
          </div>
        ) : null}
        {!isLoading && hasItems && listResponse ? (
          <>
            <div className="table-shell table-shell-scroll">
              <table className="data-table" data-testid="project-table">
                <thead>
                  <tr>
                    <th>项目编号</th>
                    <th>项目名称</th>
                    <th>颜色名称</th>
                    <th>当前工序</th>
                    <th>负责人</th>
                    <th>责任部门</th>
                    <th>截止时间</th>
                    <th>进度</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {listResponse.items.map((project) => (
                    <tr key={project.id} data-testid="project-card">
                      <td>
                        <div className="cell-stack">
                          <strong>{project.code}</strong>
                          <span>{project.isOverdue ? '已逾期' : getProjectPriorityLabel(project.riskLevel)}</span>
                        </div>
                      </td>
                      <td>{project.name}</td>
                      <td>{project.colorName ?? '未关联颜色'}</td>
                      <td>{project.currentNodeName ?? '未开始'}</td>
                      <td>{project.ownerName ?? '未设置'}</td>
                      <td>{project.ownerDepartmentName ?? '未设置'}</td>
                      <td>{formatDate(project.targetDate)}</td>
                      <td>
                        <strong>{project.progressPercent}%</strong>
                      </td>
                      <td>
                        <span className={`status-pill status-pill-${project.isOverdue ? 'critical' : project.riskLevel.toLowerCase()}`}>
                          {project.isOverdue ? '已逾期' : getProjectStatusLabel(project.status)}
                        </span>
                      </td>
                      <td>
                        <div className="task-actions">
                          <Link href={`/projects/${project.id}/overview`} className="table-link">
                            详情
                          </Link>
                          <Link href={`/projects/${project.id}/flow-map`} className="table-link">
                            流程地图
                          </Link>
                          <Link href={`/projects/${project.id}/workflow`} className="table-link">
                            时间线
                          </Link>
                          <Link href={`/projects/${project.id}/materials`} className="table-link">
                            材料
                          </Link>
                          <Link href={`/projects/${project.id}/reviews`} className="table-link">
                            评审
                          </Link>
                        </div>
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
