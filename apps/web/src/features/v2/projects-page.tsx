'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { r26Projects } from './fixtures';
import { ChevronRightIcon } from './icons';
import { PageIntro, StatusPill } from './ui';

const filters = [
  { label: '全部项目', value: 'all' },
  { label: '高风险', value: 'risk' },
  { label: '等待评审', value: 'review' },
  { label: '本周到期', value: 'due' },
  { label: '月度跟踪', value: 'tracking' },
] as const;

export function ProjectsPage() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['value']>('all');
  const [notice, setNotice] = useState<string | null>(null);

  const visibleProjects = useMemo(() => {
    if (activeFilter === 'all') {
      return r26Projects;
    }
    if (activeFilter === 'due') {
      return r26Projects.filter((project) => project.deadline.includes('今天') || project.deadline.includes('明天'));
    }
    return r26Projects.filter((project) => project.tone === activeFilter);
  }, [activeFilter]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }

  return (
    <div className="r26-page r26-projects-page" data-testid="r26-projects">
      <PageIntro
        eyebrow="项目组合"
        title="哪些项目需要介入？"
        description="先看停滞原因，再决定今天把时间放在哪里。"
        action={
          <button
            type="button"
            className="r26-button r26-button--primary"
            onClick={() => showNotice('新建项目不在 Gate 1 静态原型范围内。')}
            data-testid="new-project-static-action"
          >
            新建项目
          </button>
        }
      />

      <section className="r26-project-kpis" aria-label="项目组合摘要">
        <div><span>活跃项目</span><strong>3</strong><small>本周更新 3 个</small></div>
        <div><span>高风险</span><strong>1</strong><small>缺少关键材料</small></div>
        <div><span>本周到期</span><strong>2</strong><small>今天 1 个</small></div>
        <div><span>等待评审</span><strong>1</strong><small>第 2 轮评审</small></div>
      </section>

      <div className="r26-project-toolbar">
        <div className="r26-filter-group" role="group" aria-label="项目快速筛选">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={activeFilter === filter.value ? 'is-active' : undefined}
              aria-pressed={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span>{visibleProjects.length} 个项目</span>
      </div>

      <section className="r26-project-list" aria-live="polite">
        {visibleProjects.map((project) => (
          <article key={project.id} className={`r26-project-card r26-project-card--${project.tone}`}>
            <div className="r26-project-card__main">
              <div className="r26-project-card__identity">
                <span className="r26-project-color" style={{ background: project.colorHex }} aria-label={`${project.colorName}色样`} />
                <div>
                  <div className="r26-project-card__titleline">
                    <h2>{project.name}</h2>
                    <StatusPill tone={project.tone}>{project.status}</StatusPill>
                  </div>
                  <p>{project.currentStep}</p>
                </div>
              </div>

              <dl className="r26-project-card__facts">
                <div><dt>当前负责人</dt><dd>{project.owner}</dd></div>
                <div><dt>计划截止</dt><dd>{project.deadline}</dd></div>
                <div><dt>流程进度</dt><dd>{project.progress}</dd></div>
                <div><dt>最近更新</dt><dd>{project.updatedAt}</dd></div>
              </dl>

              <div className="r26-project-card__risk">
                <span>需要关注</span>
                <div>
                  <strong>{project.riskReason}</strong>
                  <p>{project.expectedResolution}</p>
                </div>
              </div>
            </div>

            <div className="r26-project-card__action">
              <div className="r26-progress-ring" style={{ '--progress': project.id === 'demo-r26' ? 39 : project.id === 'silver-r26' ? 61 : 25 } as React.CSSProperties}>
                <strong>{project.progress}</strong>
                <span>已完成</span>
              </div>
              {project.id === 'demo-r26' ? (
                <Link href="/v2/projects/demo-r26" data-testid="open-demo-r26-project">
                  打开项目
                  <ChevronRightIcon />
                </Link>
              ) : (
                <button type="button" onClick={() => showNotice(`${project.name}仅用于项目组合筛选展示。`)}>
                  查看摘要
                  <ChevronRightIcon />
                </button>
              )}
            </div>
          </article>
        ))}

        {visibleProjects.length === 0 ? (
          <div className="r26-empty-state">
            <strong>当前筛选下没有项目</strong>
            <p>切换其他筛选即可继续查看静态项目组合。</p>
          </div>
        ) : null}
      </section>

      {notice ? <div className="r26-toast" role="status">{notice}</div> : null}
    </div>
  );
}
