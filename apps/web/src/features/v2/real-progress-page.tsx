'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { R26ProgressResponse } from './real-types';
import { RealDataState } from './real-ui';
import { PageIntro, StatusPill } from './ui';
import { useR26ReadOnlyData } from './use-r26-readonly-data';

export function RealProgressPage() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get('taskId');
  const projectId = searchParams.get('projectId');
  const path = taskId
    ? `/v2/tasks/${encodeURIComponent(taskId)}/progress-context`
    : null;
  const { data, error, loading } = useR26ReadOnlyData<R26ProgressResponse>(path);

  if (!taskId) {
    return (
      <div className="r26-page">
        <section className="r26-empty-state">
          <strong>请选择需要查看的工序</strong>
          <p>Gate 2 只读进展页需要从工作台或项目工作区带入真实 taskId。</p>
          <Link className="r26-button r26-button--primary" href="/v2/dashboard">返回工作台</Link>
        </section>
      </div>
    );
  }

  if (loading || error || !data) {
    return <RealDataState loading={loading} error={error} label="正在读取真实进展上下文…" />;
  }

  const { task, viewer } = data;
  const missingMaterials = task.requiredMaterials.filter((material) => {
    const name = material.name ?? material.label ?? '';
    return !task.attachments.some(
      (attachment) =>
        attachment.materialType === material.code ||
        (name && attachment.fileName.includes(name)),
    );
  });

  return (
    <div
      className="r26-page r26-progress-page"
      data-testid="r26-progress-readonly"
      data-source="database"
    >
      <div className="r26-readonly-banner" role="status">
        <strong>Gate 2 · 进展上下文只读</strong>
        <span>{data.notice}</span>
      </div>
      <PageIntro
        eyebrow="真实工序上下文"
        title="核对本次进展所需信息"
        description="项目、工序、人员、SLA 和材料由服务端自动带出；本轮不显示表单、上传区或提交按钮。"
      />

      <section className="r26-progress-context" aria-label="当前进展上下文">
        <div className="r26-progress-context__identity">
          <span className="r26-color-swatch r26-real-color" aria-hidden="true" />
          <div>
            <span>{task.project.colorName} · {task.project.name}</span>
            <strong>第 {String(task.stepNumber).padStart(2, '0')} 步 · {task.stepName}</strong>
          </div>
        </div>
        <div className="r26-progress-context__facts">
          <span>负责人：{task.owner?.name ?? '尚未分配'}</span>
          <span>截止：{formatDateTime(task.schedule.effectiveDueAt)}</span>
          <StatusPill tone={task.schedule.isOverdue ? 'risk' : 'current'}>
            {task.statusLabel}
          </StatusPill>
        </div>
      </section>

      <section className="r26-real-progress-grid">
        <article className="r26-card r26-real-progress-card">
          <p className="r26-eyebrow">自动带出</p>
          <h2>项目、工序与人员</h2>
          <dl className="r26-detail-grid">
            <div><dt>当前用户</dt><dd>{viewer.name} · {viewer.departmentName ?? '未设置部门'}</dd></div>
            <div><dt>项目</dt><dd>{task.project.name}</dd></div>
            <div><dt>工序</dt><dd>{task.stepName}</dd></div>
            <div><dt>负责人</dt><dd>{task.owner?.name ?? '尚未分配'}</dd></div>
            <div><dt>主责部门</dt><dd>{task.department.name ?? '尚未分配'}</dd></div>
            <div><dt>协同人</dt><dd>{task.collaborators.map((person) => person.name).join('、') || '无'}</dd></div>
          </dl>
        </article>

        <article className="r26-card r26-real-progress-card">
          <p className="r26-eyebrow">SLA 与时间</p>
          <h2>本次处理窗口</h2>
          <dl className="r26-detail-grid">
            <div><dt>开始时间</dt><dd>{formatDateTime(task.schedule.startedAt)}</dd></div>
            <div><dt>有效截止</dt><dd>{formatDateTime(task.schedule.effectiveDueAt)}</dd></div>
            <div><dt>SLA 状态</dt><dd>{task.schedule.slaStatus}</dd></div>
            <div><dt>逾期天数</dt><dd>{task.schedule.overdueDays} 天</dd></div>
            <div><dt>剩余工作日</dt><dd>{task.schedule.remainingWorkdays ?? '按前置节点确定'}</dd></div>
            <div><dt>时间进度</dt><dd>{task.schedule.progressPercent}%</dd></div>
          </dl>
        </article>
      </section>

      <section className="r26-card r26-real-section" data-testid="r26-progress-materials">
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">材料事实</p>
            <h2>必交、已上传与缺失项</h2>
          </div>
          <span>{task.attachments.length} 份已上传 · {missingMaterials.length} 项缺失</span>
        </div>
        <div className="r26-progress-material-columns">
          <div>
            <h3>必交材料</h3>
            <ul>
              {task.requiredMaterials.map((material, index) => (
                <li key={material.code ?? material.name ?? index}>
                  <span>{index + 1}</span>
                  <strong>{material.name ?? material.label ?? `材料 ${index + 1}`}</strong>
                </li>
              ))}
              {task.requiredMaterials.length === 0 ? <li>未配置必交材料</li> : null}
            </ul>
          </div>
          <div>
            <h3>已上传材料</h3>
            <ul>
              {task.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <span>✓</span>
                  <div>
                    <strong>{attachment.fileName}</strong>
                    <small>{attachment.uploadedByName ?? '系统'} · {formatDateTime(attachment.uploadedAt)}</small>
                  </div>
                </li>
              ))}
              {task.attachments.length === 0 ? <li>暂无已上传材料</li> : null}
            </ul>
          </div>
          <div>
            <h3>缺失项</h3>
            <ul>
              {missingMaterials.map((material, index) => (
                <li key={material.code ?? material.name ?? index} className="is-missing">
                  <span>!</span>
                  <strong>{material.name ?? material.label ?? `材料 ${index + 1}`}</strong>
                </li>
              ))}
              {missingMaterials.length === 0 ? <li className="is-complete">必交材料已齐备</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <footer className="r26-readonly-progress-footer">
        <div>
          <strong>本轮不会产生业务写请求</strong>
          <span>没有保存草稿、上传材料、下一步或提交进展动作。</span>
        </div>
        <Link
          className="r26-button r26-button--primary"
          href={`/v2/projects/${encodeURIComponent(projectId ?? task.projectId)}?taskId=${encodeURIComponent(task.taskId)}`}
        >
          返回项目工作区
        </Link>
      </footer>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '待确定';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
