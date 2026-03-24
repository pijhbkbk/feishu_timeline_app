'use client';

import { useEffect, useState } from 'react';

import { ProjectEditor } from './project-editor';
import { fetchProject, type ProjectDetail } from '../lib/projects-client';

type ProjectOverviewClientProps = {
  projectId: string;
};

export function ProjectOverviewClient({ projectId }: ProjectOverviewClientProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProject();
  }, [projectId]);

  async function loadProject() {
    setIsLoading(true);
    setError(null);

    try {
      const detail = await fetchProject(projectId);
      setProject(detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目详情加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <section className="page-card">
        <p className="eyebrow">Project Overview</p>
        <h1>正在加载项目详情…</h1>
        <p>项目基础信息、成员和流程摘要正在拉取。</p>
      </section>
    );
  }

  if (error || !project) {
    return (
      <section className="page-card">
        <p className="eyebrow">Project Overview</p>
        <h1>项目详情加载失败</h1>
        <p>{error ?? '找不到对应项目。'}</p>
      </section>
    );
  }

  return <ProjectEditor mode="edit" projectId={projectId} initialProject={project} />;
}
