'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import {
  completeProjectRetrospective,
  fetchProjectRetrospective,
  saveProjectRetrospective,
  type ProjectRetrospectiveResponse,
  type SaveRetrospectiveInput,
} from '../lib/retrospectives-client';
import { useAuth } from './auth-provider';
import { R22Card, R22Kpi, R22StatusBadge } from './r22-ui';

export function ProjectRetrospectiveR22({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<ProjectRetrospectiveResponse | null>(null);
  const [draft, setDraft] = useState<SaveRetrospectiveInput>(emptyDraft());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void load(); }, [projectId]);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchProjectRetrospective(projectId);
      setData(response);
      setDraft(toDraft(response));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '项目复盘加载失败。');
    } finally {
      setIsLoading(false);
    }
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await saveProjectRetrospective(projectId, normalizeDraft(draft));
      setData(response);
      setDraft(toDraft(response));
      setNotice('复盘草稿已保存，审计日志已记录。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '复盘保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function complete() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await completeProjectRetrospective(projectId, normalizeDraft(draft));
      setData(response);
      setDraft(toDraft(response));
      setNotice('复盘已经完成并锁定，历史结论不会被覆盖。');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : '完成复盘失败。');
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = Boolean(user && (user.isSystemAdmin || user.roleCodes.includes('admin') || user.roleCodes.includes('project_manager')));
  const isCompleted = data?.form.status === 'COMPLETED';
  const readOnly = !canEdit || isCompleted;

  if (isLoading && !data) return <div className="r22-card r22-skeleton-card" aria-label="正在生成生命周期复盘" />;
  if (!data) return <section className="r22-card r22-state-card"><h1>复盘暂时不可用</h1><p>{error ?? '无法读取项目数据。'}</p><button className="r22-button r22-button-primary" type="button" onClick={() => void load()}>重新加载</button></section>;

  return (
    <div className="r22-page r22-retrospective-page" data-testid="retrospective-page">
      <header className="r22-project-hero">
        <div><p className="r22-breadcrumb"><Link href="/projects">项目</Link><span>/</span><Link href={`/projects/${projectId}`}>{data.project.code}</Link></p><div className="r22-project-title-row"><h1>生命周期复盘</h1><R22StatusBadge tone={isCompleted ? 'success' : 'brand'}>{isCompleted ? '已完成' : '草稿'}</R22StatusBadge></div><p>{data.project.name}{data.project.colorName ? ` · ${data.project.colorName}` : ''}</p></div>
        <div className="r22-page-hero-actions"><button type="button" className="r22-button r22-button-secondary" onClick={() => window.print()}>打印 / 导出 PDF</button>{canEdit && !isCompleted ? <button type="button" className="r22-button r22-button-primary" disabled={isSaving} onClick={() => void save()}>{isSaving ? '正在保存…' : '保存草稿'}</button> : null}</div>
      </header>

      {error ? <div className="r22-inline-alert"><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div> : null}
      {notice ? <div className="r22-inline-success" role="status">{notice}</div> : null}
      {!canEdit ? <div className="r22-permission-note">你可以查看完整复盘；只有项目经理或管理员可以编辑和完成复盘。</div> : null}

      <R22Card className="r22-retro-conclusion"><div><p className="r22-overline">Executive summary</p><h2>项目结论</h2><p>{data.summary.conclusion}</p></div><R22StatusBadge tone={data.summary.delayDays > 0 ? 'warning' : 'success'}>{data.summary.delayDays > 0 ? `延期 ${data.summary.delayDays} 天` : '周期正常'}</R22StatusBadge></R22Card>

      <section className="r22-kpi-grid">
        <R22Kpi label="年产量" value={data.summary.annualOutput ?? '—'} hint="来自颜色退出结论" tone="brand" />
        <R22Kpi label="月度评审" value={`${data.summary.monthlyCompleted}/${data.summary.monthlyTotal}`} hint="真实周期任务完成数" tone="monthly" />
        <R22Kpi label="计划周期" value={`${data.summary.plannedDurationDays} 天`} hint="按项目计划日期计算" tone="neutral" />
        <R22Kpi label="实际周期" value={`${data.summary.actualDurationDays} 天`} hint="按实际起止日期计算" tone={data.summary.delayDays > 0 ? 'warning' : 'success'} />
      </section>

      <R22Card>
        <div className="r22-section-heading"><div><p className="r22-overline">Stage comparison</p><h2>阶段用时对比</h2><p>五个生命周期阶段均由真实工序时间聚合。</p></div></div>
        <div className="r22-stage-comparison" role="table" aria-label="阶段用时对比"><div className="r22-stage-row r22-stage-row-head" role="row"><span>阶段</span><span>计划</span><span>实际</span><span>偏差</span><span>完成任务</span></div>{data.stages.map((stage) => <div className="r22-stage-row" role="row" key={stage.key}><strong>{stage.name}</strong><span>{stage.plannedDays} 天</span><span>{stage.actualDays} 天</span><span className={stage.varianceDays > 0 ? 'is-danger' : 'is-positive'}>{stage.varianceDays > 0 ? '+' : ''}{stage.varianceDays} 天</span><span>{stage.completedTasks} / {stage.totalTasks}</span></div>)}</div>
      </R22Card>

      <section className="r22-retro-bottlenecks">
        <BottleneckCard label="最大延期" value={data.bottlenecks.maxDelay ? `${data.bottlenecks.maxDelay.days} 天` : '无'} detail={data.bottlenecks.maxDelay?.nodeName ?? '没有发现延期工序'} />
        <BottleneckCard label="最多返工" value={data.bottlenecks.maxRework ? `${data.bottlenecks.maxRework.rounds} 轮` : '无'} detail={data.bottlenecks.maxRework?.nodeName ?? '没有发现重复返工'} />
        <BottleneckCard label="材料缺失" value={data.bottlenecks.maxMissingMaterial ? `${data.bottlenecks.maxMissingMaterial.count} 项` : '无'} detail={data.bottlenecks.maxMissingMaterial?.nodeName ?? '配置材料已覆盖'} />
        <BottleneckCard label="高频阻塞" value={data.bottlenecks.frequentBlocker ? `${data.bottlenecks.frequentBlocker.count} 次` : '无'} detail={data.bottlenecks.frequentBlocker?.description ?? '没有阻塞记录'} />
      </section>

      <R22Card className="r22-retro-form">
        <div className="r22-section-heading"><div><p className="r22-overline">Learning</p><h2>经验与改进</h2><p>改进项保存到项目复盘记录，完成后锁定。</p></div>{data.form.updatedAt ? <span className="r22-result-count">最近保存 {new Date(data.form.updatedAt).toLocaleString('zh-CN')}</span> : null}</div>
        <div className="r22-retro-form-grid">
          <label className="r22-field r22-field-full"><span>复盘结论</span><textarea disabled={readOnly} value={draft.conclusion} onChange={(event) => setDraft({ ...draft, conclusion: event.target.value })} placeholder="概括项目最终结论、价值和后续方向" /></label>
          <label className="r22-field"><span>做得好的地方</span><textarea disabled={readOnly} value={draft.strengths} onChange={(event) => setDraft({ ...draft, strengths: event.target.value })} /></label>
          <label className="r22-field"><span>主要问题</span><textarea disabled={readOnly} value={draft.problems} onChange={(event) => setDraft({ ...draft, problems: event.target.value })} /></label>
          <label className="r22-field"><span>可复用经验</span><textarea disabled={readOnly} value={draft.reusableExperience} onChange={(event) => setDraft({ ...draft, reusableExperience: event.target.value })} /></label>
          <label className="r22-field"><span>建议更新的流程规则</span><textarea disabled={readOnly} value={draft.workflowRuleUpdates} onChange={(event) => setDraft({ ...draft, workflowRuleUpdates: event.target.value })} /></label>
        </div>
        <div className="r22-improvement-list">
          <div><span>后续改进措施</span>{!readOnly ? <button type="button" onClick={() => setDraft({ ...draft, improvementMeasures: [...draft.improvementMeasures, emptyImprovement()] })}>添加一项</button> : null}</div>
          {draft.improvementMeasures.length ? draft.improvementMeasures.map((item, index) => (
            <article key={index} className="r22-improvement-card">
              <header><span>{index + 1}</span><strong>改进项</strong>{!readOnly ? <button type="button" aria-label={`删除第 ${index + 1} 项`} onClick={() => setDraft({ ...draft, improvementMeasures: draft.improvementMeasures.filter((_, currentIndex) => currentIndex !== index) })}>删除</button> : null}</header>
              <div>
                <label className="r22-field"><span>问题</span><input disabled={readOnly} value={item.problem} onChange={(event) => updateImprovement(index, 'problem', event.target.value, draft, setDraft)} /></label>
                <label className="r22-field"><span>根本原因</span><input disabled={readOnly} value={item.rootCause} onChange={(event) => updateImprovement(index, 'rootCause', event.target.value, draft, setDraft)} /></label>
                <label className="r22-field r22-field-full"><span>改进措施</span><textarea disabled={readOnly} value={item.measure} onChange={(event) => updateImprovement(index, 'measure', event.target.value, draft, setDraft)} /></label>
                <label className="r22-field"><span>责任部门</span><input disabled={readOnly} value={item.responsibleDepartment} onChange={(event) => updateImprovement(index, 'responsibleDepartment', event.target.value, draft, setDraft)} /></label>
                <label className="r22-field"><span>完成日期</span><input type="date" disabled={readOnly} value={item.dueDate ?? ''} onChange={(event) => updateImprovement(index, 'dueDate', event.target.value || null, draft, setDraft)} /></label>
                <label className="r22-check-field"><input type="checkbox" disabled={readOnly} checked={item.isWorkflowRuleUpdate} onChange={(event) => updateImprovement(index, 'isWorkflowRuleUpdate', event.target.checked, draft, setDraft)} /><span>需要更新流程规则</span></label>
              </div>
            </article>
          )) : <p>尚未记录改进措施。</p>}
        </div>
        {canEdit && !isCompleted ? <div className="r22-retro-actions"><button type="button" className="r22-button r22-button-secondary" disabled={isSaving} onClick={() => void save()}>保存草稿</button><div><small>{data.eligibility.reason ?? '完成后复盘结论将锁定，并保留审计记录。'}</small><button type="button" className="r22-button r22-button-primary" disabled={isSaving || !data.eligibility.canComplete} onClick={() => void complete()}>完成复盘</button></div></div> : null}
      </R22Card>
    </div>
  );
}

function BottleneckCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="r22-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function emptyDraft(): SaveRetrospectiveInput {
  return { conclusion: '', improvementMeasures: [], strengths: '', problems: '', reusableExperience: '', workflowRuleUpdates: '' };
}

function emptyImprovement() {
  return { problem: '', rootCause: '', measure: '', responsibleDepartment: '', dueDate: null, isWorkflowRuleUpdate: false };
}

function toDraft(data: ProjectRetrospectiveResponse): SaveRetrospectiveInput {
  return { conclusion: data.form.conclusion, improvementMeasures: data.form.improvementMeasures, strengths: data.form.strengths, problems: data.form.problems, reusableExperience: data.form.reusableExperience, workflowRuleUpdates: data.form.workflowRuleUpdates };
}

function normalizeDraft(draft: SaveRetrospectiveInput): SaveRetrospectiveInput {
  return {
    ...draft,
    improvementMeasures: draft.improvementMeasures
      .map((item) => ({
        ...item,
        problem: item.problem.trim(),
        rootCause: item.rootCause.trim(),
        measure: item.measure.trim(),
        responsibleDepartment: item.responsibleDepartment.trim(),
      }))
      .filter((item) => item.problem || item.measure),
  };
}

function updateImprovement<K extends keyof SaveRetrospectiveInput['improvementMeasures'][number]>(
  index: number,
  key: K,
  value: SaveRetrospectiveInput['improvementMeasures'][number][K],
  draft: SaveRetrospectiveInput,
  setDraft: (value: SaveRetrospectiveInput) => void,
) {
  setDraft({
    ...draft,
    improvementMeasures: draft.improvementMeasures.map((item, currentIndex) =>
      currentIndex === index ? { ...item, [key]: value } : item,
    ),
  });
}
