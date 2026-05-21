'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchProjects,
  formatDateTime,
  type ProjectListItem,
} from '../lib/projects-client';
import { useAuth } from './auth-provider';
import { FlowMapWorkspace } from './flow-map-workspace';
import { FeedbackBanner } from './feedback-banner';
import { StatePanel } from './state-panel';

export function ProjectsFlowMapPortal() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const requestIdRef = useRef(0);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated) {
      setIsLoading(false);
      setError('请先登录后查看项目实时流程地图。');
      return;
    }

    void loadProjects({ initial: true });
  }, [isAuthenticated, isAuthLoading]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  async function loadProjects(options?: { initial?: boolean }) {
    const requestId = ++requestIdRef.current;

    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchProjects({ page: 1, pageSize: 50 });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const sortedProjects = [...response.items].sort((left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );

      setProjects(sortedProjects);
      setSelectedProjectId((current) => {
        if (current && sortedProjects.some((project) => project.id === current)) {
          return current;
        }

        return sortedProjects[0]?.id ?? null;
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : '项目实时流程地图入口加载失败。');
      setProjects([]);
      setSelectedProjectId(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  if (isAuthLoading || isLoading) {
    return (
      <section className="page-card flow-map-loading-card">
        <p className="eyebrow">项目实时流程地图</p>
        <h2 className="section-title">正在加载项目实时流程地图入口…</h2>
        <p>正在同步可访问项目、最近更新项目和流程地图数据。</p>
      </section>
    );
  }

  if (error && projects.length === 0) {
    return (
      <section className="page-card flow-map-loading-card">
        <p className="eyebrow">项目实时流程地图</p>
        <h2 className="section-title">项目实时流程地图加载失败</h2>
        <p>{error}</p>
        <div className="inline-actions">
          <button type="button" className="button button-primary" onClick={() => void loadProjects()}>
            重新加载
          </button>
          <Link href="/login" className="button button-secondary">
            登录系统
          </Link>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="page-card flow-map-loading-card">
        <p className="eyebrow">项目实时流程地图</p>
        <StatePanel
          title="暂无可查看的项目"
          description="创建项目后，系统会自动生成 18 个流程节点，并在这里展示实时流程地图。"
        />
        <div className="inline-actions">
          <Link href="/projects/new" className="button button-primary">
            新建项目
          </Link>
          <Link href="/projects" className="button button-secondary">
            返回项目列表
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack flow-map-portal" data-testid="projects-flow-map-portal">
      <section className="page-card flow-map-portal-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">项目实时流程地图</p>
            <h2 className="section-title">项目实时流程地图</h2>
            <p className="muted">
              选择一个项目后，直接查看该项目 18 个节点的实时推进位置、风险节点和下一步。
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isRefreshing}
              onClick={() => void loadProjects()}
            >
              {isRefreshing ? '刷新中…' : '立即刷新'}
            </button>
            <Link href="/projects" className="button button-secondary">
              项目列表
            </Link>
          </div>
        </div>
        {error ? <FeedbackBanner variant="error" title="项目入口刷新失败" message={error} /> : null}
        <div className="flow-map-project-picker">
          <label className="field">
            <span>选择项目</span>
            <select
              value={selectedProjectId ?? ''}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} / {project.currentNodeName ?? '未开始'} / {project.progressPercent}%
                </option>
              ))}
            </select>
          </label>
          {selectedProject ? (
            <div className="flow-map-project-summary">
              <div>
                <span>当前项目</span>
                <strong>{selectedProject.name}</strong>
              </div>
              <div>
                <span>当前节点</span>
                <strong>{selectedProject.currentNodeName ?? '未开始'}</strong>
              </div>
              <div>
                <span>当前负责人</span>
                <strong>{selectedProject.ownerName ?? '未分配'}</strong>
              </div>
              <div>
                <span>整体进度</span>
                <strong>{selectedProject.progressPercent}%</strong>
              </div>
              <div className={selectedProject.isOverdue ? 'timeline-meta-danger' : undefined}>
                <span>逾期状态</span>
                <strong>{selectedProject.isOverdue ? '已逾期' : '未逾期'}</strong>
              </div>
              <div>
                <span>最近更新时间</span>
                <strong>{formatDateTime(selectedProject.updatedAt)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {selectedProjectId ? (
        <FlowMapWorkspace key={selectedProjectId} projectId={selectedProjectId} />
      ) : null}
    </div>
  );
}
