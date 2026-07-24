'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { r26Projects } from './fixtures';
import { ChevronRightIcon } from './icons';
import { isR26ReadOnlyRealDataEnabled } from './r26-data-mode';
import type { R26ProjectListItem, R26ProjectsResponse } from './real-types';
import { RealDataState } from './real-ui';
import { PageIntro, StatusPill } from './ui';
import { useR26ReadOnlyData } from './use-r26-readonly-data';

const filters = [
  { label: '全部', value: 'all' },
  { label: '正常', value: 'normal' },
  { label: '有风险', value: 'risk' },
  { label: '已逾期', value: 'overdue' },
  { label: '等待评审', value: 'review' },
] as const;

export function ProjectsPage() {
  if (isR26ReadOnlyRealDataEnabled()) {
    return <RealProjectsPage />;
  }

  return <PrototypeProjectsPage />;
}

function PrototypeProjectsPage() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['value']>('all');
  const [notice, setNotice] = useState<string | null>(null);

  const visibleProjects = useMemo(() => {
    if (activeFilter === 'all') {
      return r26Projects;
    }
    if (activeFilter === 'normal') {
      return r26Projects.filter((project) => project.tone === 'tracking');
    }
    if (activeFilter === 'overdue') {
      return [];
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
        <div><span>风险项目</span><strong>1</strong><small>缺少关键材料</small></div>
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

function RealProjectsPage() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['value']>('all');
  const path = `/v2/projects?view=${encodeURIComponent(activeFilter)}&page=1&pageSize=50`;
  const { data, error, loading } = useR26ReadOnlyData<R26ProjectsResponse>(path);

  if (loading || error || !data) {
    return <RealDataState loading={loading} error={error} label="正在读取真实项目列表…" />;
  }

  const summary = data.projects.summary;
  const projects = data.projects.items;

  return (
    <div
      className="r26-page r26-projects-page"
      data-testid="r26-projects"
      data-source="database"
    >
      <div className="r26-readonly-banner" role="status">
        <strong>Gate 2 · 真实只读项目</strong>
        <span>项目卡、风险和停滞原因来自 staging；本页没有新建或修改入口。</span>
      </div>
      <PageIntro
        eyebrow="项目组合"
        title="哪些项目需要介入？"
        description="先识别停滞、逾期和评审风险，再进入真实项目工作区。"
      />

      <section className="r26-project-kpis" aria-label="项目组合摘要">
        <div><span>活跃项目</span><strong>{summary.active}</strong><small>当前可见范围</small></div>
        <div><span>风险项目</span><strong>{summary.risk}</strong><small>按后端风险规则</small></div>
        <div><span>本周到期</span><strong>{summary.dueThisWeek}</strong><small>真实截止时间</small></div>
        <div><span>等待评审</span><strong>{summary.pendingReview}</strong><small>活动评审任务</small></div>
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
        <span>{projects.length} 个项目</span>
      </div>

      <section className="r26-project-list" aria-live="polite">
        {projects.map((project) => (
          <RealProjectCard key={project.id} project={project} />
        ))}
        {projects.length === 0 ? (
          <div className="r26-empty-state">
            <strong>当前筛选下没有项目</strong>
            <p>这是 staging 数据库的真实查询结果，可切换其他筛选继续查看。</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RealProjectCard({ project }: { project: R26ProjectListItem }) {
  const tone = project.stall || project.isOverdue || project.riskLevel === 'HIGH'
    ? 'risk'
    : project.currentNodeCode?.includes('REVIEW')
      ? 'review'
      : 'tracking';
  const attention = project.stall
    ? project.stall.reason
    : project.isOverdue
      ? '当前工序已经超过计划完成时间。'
      : '当前未发现阻塞，按计划继续推进。';
  const expected = project.stall?.expectedResolvedAt
    ? `预计 ${formatProjectDate(project.stall.expectedResolvedAt)} 解除`
    : project.stall
      ? '预计解除时间尚未填写'
      : `下一步：${project.currentNodeName ?? '等待流程启动'}`;

  return (
    <article
      className={`r26-project-card r26-project-card--${tone}`}
      data-testid={`real-project-${project.id}`}
    >
      <div className="r26-project-card__main">
        <div className="r26-project-card__identity">
          <span className="r26-project-color r26-real-color" aria-hidden="true" />
          <div>
            <div className="r26-project-card__titleline">
              <h2>{project.colorName ?? project.name}</h2>
              <StatusPill tone={tone}>{projectStatusLabel(project, tone)}</StatusPill>
            </div>
            <p>{project.name} · {project.currentNodeName ?? '尚未启动流程'}</p>
          </div>
        </div>
        <dl className="r26-project-card__facts">
          <div><dt>当前负责人</dt><dd>{project.currentTaskOwnerName ?? project.ownerName ?? '尚未分配'}</dd></div>
          <div><dt>责任部门</dt><dd>{project.currentTaskDepartmentName ?? '责任部门待分配'}</dd></div>
          <div><dt>计划截止</dt><dd>{formatProjectDate(project.currentTaskDueAt ?? project.targetDate)}</dd></div>
          <div><dt>流程进度</dt><dd>{project.progressText}</dd></div>
        </dl>
        <div className="r26-project-card__risk">
          <span>{tone === 'risk' ? '需要关注' : '当前状态'}</span>
          <div>
            <strong>{attention}</strong>
            <p>
              {project.stall?.ownerName ? `责任人：${project.stall.ownerName} · ` : ''}
              {expected}
            </p>
          </div>
        </div>
      </div>
      <div className="r26-project-card__action">
        <div
          className="r26-progress-ring"
          style={{ '--progress': project.progressPercent } as React.CSSProperties}
        >
          <strong>{project.progressText}</strong>
          <span>当前步骤</span>
        </div>
        <Link
          href={`/v2/projects/${encodeURIComponent(project.id)}${project.currentTaskId ? `?taskId=${encodeURIComponent(project.currentTaskId)}` : ''}`}
        >
          打开项目
          <ChevronRightIcon />
        </Link>
      </div>
    </article>
  );
}

function projectStatusLabel(project: R26ProjectListItem, tone: string) {
  if (tone === 'risk') {
    return project.isOverdue ? '已逾期' : '有风险';
  }
  if (tone === 'review') {
    return '等待评审';
  }
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    IN_PROGRESS: '正常推进',
    ON_HOLD: '已暂停',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  };
  return labels[project.status] ?? '跟踪中';
}

function formatProjectDate(value: string | null) {
  if (!value) {
    return '待确定';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
