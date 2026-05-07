'use client';

import { useEffect, useRef, useState } from 'react';

import { ProjectEditor } from './project-editor';
import { fetchProject, formatDateTime, type ProjectDetail } from '../lib/projects-client';

type ProjectOverviewClientProps = {
  projectId: string;
};

export function ProjectOverviewClient({ projectId }: ProjectOverviewClientProps) {
  const isFormDirtyRef = useRef(false);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);

  useEffect(() => {
    void loadProject({ initial: true });
    const timer = window.setInterval(() => {
      if (!isFormDirtyRef.current) {
        void loadProject({ silent: true });
      }
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [projectId]);

  function handleDirtyChange(nextDirty: boolean) {
    isFormDirtyRef.current = nextDirty;
    setIsFormDirty(nextDirty);
  }

  async function loadProject(options?: { initial?: boolean; silent?: boolean }) {
    if (options?.initial) {
      setIsLoading(true);
    } else if (!options?.silent) {
      setIsRefreshing(true);
    }

    if (!options?.silent) {
      setError(null);
    }

    try {
      const detail = await fetchProject(projectId);
      if (options?.silent && isFormDirtyRef.current) {
        return;
      }

      setProject(detail);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : '项目详情加载失败。');
      }
    } finally {
      if (options?.initial) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }

  if (isLoading) {
    return (
      <section className="page-card">
        <p className="eyebrow">项目概览</p>
        <h1>正在加载项目详情…</h1>
        <p>项目基础信息、成员和流程摘要正在拉取。</p>
      </section>
    );
  }

  if (error || !project) {
    return (
      <section className="page-card">
        <p className="eyebrow">项目概览</p>
        <h1>项目详情加载失败</h1>
          <p>{error ?? '找不到对应项目。'}</p>
          <div className="page-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadProject({ initial: true })}
            >
              重新加载
            </button>
          </div>
      </section>
    );
  }

  return (
    <div className="page-stack" data-testid="project-overview-page">
      <section className="page-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">实时刷新</p>
            <h2 className="section-title">项目详情同步状态</h2>
            <p className="muted">
              最近更新：{formatDateTime(lastUpdatedAt)}。详情页每 15 秒自动刷新；
              正在编辑表单时会暂停自动覆盖未保存输入。
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={isRefreshing || isFormDirty}
            onClick={() => void loadProject()}
          >
            {isRefreshing ? '刷新中…' : isFormDirty ? '编辑中暂停刷新' : '立即刷新'}
          </button>
        </div>
      </section>
      <ProjectEditor
        mode="edit"
        projectId={projectId}
        initialProject={project}
        onDirtyChange={handleDirtyChange}
      />
    </div>
  );
}
