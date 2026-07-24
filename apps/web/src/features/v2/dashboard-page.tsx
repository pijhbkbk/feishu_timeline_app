'use client';

import Link from 'next/link';

import { CheckIcon } from './icons';
import { useR26PrototypeStore } from './prototype-store';
import { isR26ReadOnlyRealDataEnabled } from './r26-data-mode';
import { useR26RealData } from './r26-real-data-context';
import { RealDataState } from './real-ui';
import { Fact, PageIntro, PrimaryLink, StatusPill } from './ui';

const stages = ['需求立项', '开发确认', '采购与验证', '试制评审', '批量生产', '退出跟踪'];

export function DashboardPage() {
  if (isR26ReadOnlyRealDataEnabled()) {
    return <RealDashboardPage />;
  }

  return <PrototypeDashboardPage />;
}

function PrototypeDashboardPage() {
  const { progressSubmitted, recentActivities } = useR26PrototypeStore();

  return (
    <div className="r26-page r26-dashboard-page" data-testid="r26-dashboard">
      <PageIntro
        eyebrow="今天 · 采购部"
        title="张七巧，今天先把这一步推进。"
        description={
          progressSubmitted
            ? '涂料采购进展已记录，项目下一项已进入首台生产计划。'
            : '当前只有一项必须优先处理：为深海蓝项目补齐采购到货证据。'
        }
      />

      <section className={`r26-current-task ${progressSubmitted ? 'is-complete' : ''}`}>
        <div className="r26-current-task__main">
          <div className="r26-current-task__topline">
            <StatusPill tone={progressSubmitted ? 'completed' : 'current'}>
              {progressSubmitted ? '本次进展已完成' : '当前任务'}
            </StatusPill>
            <span>今天 17:00 截止</span>
          </div>
          <div className="r26-current-task__heading">
            <span className="r26-color-swatch" style={{ background: '#1f4e79' }} aria-label="深海蓝色样" />
            <div>
              <p>深海蓝 · 第 06 步</p>
              <h2>{progressSubmitted ? '涂料采购进展已提交' : '完成涂料采购到货确认'}</h2>
            </div>
          </div>
          <p className="r26-current-task__summary">
            {progressSubmitted
              ? '提交记录已写入本地原型会话，地图中的采购节点同步完成。'
              : '采购订单和供应商送货单已经齐备，还缺一份到货确认记录。'}
          </p>

          <div className="r26-current-task__facts">
            <Fact label="负责人" value="张七巧" note="采购部" />
            <Fact label="材料" value={progressSubmitted ? '3 / 3' : '2 / 3'} note={progressSubmitted ? '已齐备' : '缺到货确认记录'} />
            <Fact label="项目进度" value={progressSubmitted ? '8 / 18' : '7 / 18'} note="固定流程节点" />
            <Fact label="阻塞" value="无" note="可直接推进" />
          </div>

          <div className="r26-current-task__action">
            {progressSubmitted ? (
              <PrimaryLink href="/v2/projects/demo-r26?taskId=t006" testId="dashboard-primary-action">
                查看项目工作区
              </PrimaryLink>
            ) : (
              <PrimaryLink
                href="/v2/progress?projectId=demo-r26&taskId=t006"
                testId="dashboard-primary-action"
              >
                提交工作进展
              </PrimaryLink>
            )}
            <p>预计用时 60 秒</p>
          </div>
        </div>

        <aside className="r26-current-task__side" aria-label="项目六阶段进度">
          <div>
            <p className="r26-eyebrow">六阶段进度</p>
            <strong>{progressSubmitted ? '采购完成，准备生产计划' : '当前在采购与验证阶段'}</strong>
          </div>
          <ol>
            {stages.map((stage, index) => {
              const complete = index < (progressSubmitted ? 3 : 2);
              const current = index === (progressSubmitted ? 3 : 2);
              return (
                <li key={stage} className={complete ? 'is-complete' : current ? 'is-current' : undefined}>
                  <span>{complete ? <CheckIcon /> : index + 1}</span>
                  <div>
                    <strong>{stage}</strong>
                    <small>{complete ? '已完成' : current ? '进行中' : '未开始'}</small>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>

      <section className="r26-kpi-grid" aria-label="今日工作摘要">
        <Fact label="我的待办" value={progressSubmitted ? '2' : '3'} note="按优先级排列" />
        <Fact
          label="今天到期"
          value={progressSubmitted ? '0' : '1'}
          note={progressSubmitted ? '今日任务已按时完成' : '采购到货确认'}
        />
        <Fact label="待我评审" value="1" note="驾驶室评审第 2 轮" />
        <Fact label="材料缺口" value={progressSubmitted ? '1' : '2'} note="跨两个项目" />
      </section>

      <section className="r26-dashboard-lower">
        <div className="r26-card r26-next-task">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">下一项</p>
              <h2>首台生产计划</h2>
            </div>
            <StatusPill tone="neutral">待开始</StatusPill>
          </div>
          <p>采购工序完成后，由赵知行确认首台排产时间与生产资源。</p>
          <dl>
            <div><dt>项目</dt><dd>深海蓝</dd></div>
            <div><dt>负责人</dt><dd>赵知行 · 生产部</dd></div>
            <div><dt>计划截止</dt><dd>7月26日</dd></div>
          </dl>
        </div>

        <div className="r26-card r26-activity-card">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">最近动态</p>
              <h2>与你相关的更新</h2>
            </div>
            <Link href="/v2/projects/demo-r26">打开项目</Link>
          </div>
          <ul>
            {recentActivities.slice(0, 4).map((activity, index) => (
              <li key={`${activity.time}-${index}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>{activity.text}</strong>
                  <small>{activity.time}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function RealDashboardPage() {
  const { dashboardResponse, error, loading } = useR26RealData();

  if (loading || error || !dashboardResponse) {
    return (
      <RealDataState
        loading={loading}
        error={error}
        label="正在读取当前飞书用户与工作台事实…"
      />
    );
  }

  const { dashboard, viewer } = dashboardResponse;
  const currentTask = dashboard.currentTask;
  const nextTask = dashboard.nextTask;

  return (
    <div
      className="r26-page r26-dashboard-page"
      data-testid="r26-dashboard"
      data-source="database"
    >
      <div className="r26-readonly-banner" role="status">
        <strong>Gate 3B · 真实进展与材料</strong>
        <span>可提交进展与工序材料；完成工序和流程推进仍保持关闭。</span>
      </div>
      <PageIntro
        eyebrow={`${viewer.roleLabel} · ${viewer.departmentName ?? '组织部门待同步'}`}
        title={`${viewer.name}，今天先处理最重要的一项。`}
        description={
          currentTask
            ? '任务、材料和期限均来自独立 staging 数据库。'
            : '当前账号没有待处理工序，可以查看可见项目的最近动态。'
        }
      />

      {currentTask ? (
        <section className="r26-current-task">
          <div className="r26-current-task__main">
            <div className="r26-current-task__topline">
              <StatusPill tone={currentTask.isOverdue ? 'risk' : 'current'}>
                {currentTask.isOverdue ? `已逾期 ${currentTask.overdueDays} 天` : '当前最重要任务'}
              </StatusPill>
              <span>{formatDeadline(currentTask.dueAt)}</span>
            </div>
            <div className="r26-current-task__heading">
              <span className="r26-color-swatch r26-real-color" aria-hidden="true" />
              <div>
                <p>{currentTask.projectName} · {formatStep(currentTask.nodeCode)}</p>
                <h2>{currentTask.nodeName}</h2>
              </div>
            </div>
            <p className="r26-current-task__summary">
              {currentTask.blocker
                ? `当前阻塞：${currentTask.blocker.description}`
                : currentTask.materials.missing > 0
                ? `仍缺 ${currentTask.materials.missing} 项必交材料，请先核对工序详情。`
                : '必交材料已齐备，可按当前工序要求继续处理。'}
            </p>
            <div className="r26-current-task__facts">
              <Fact label="项目" value={currentTask.projectName} note="真实项目数据" />
              <Fact
                label="材料"
                value={`${currentTask.materials.submitted} / ${currentTask.materials.required}`}
                note={currentTask.materials.missing > 0 ? `缺 ${currentTask.materials.missing} 项` : '已齐备'}
              />
              <Fact label="截止时间" value={formatDateTime(currentTask.dueAt)} note={currentTask.isOverdue ? '需要立即关注' : '按 SLA 计算'} />
              <Fact label="完成度" value={`${currentTask.completionPercent}%`} note="最近进展记录" />
              <Fact
                label="阻塞"
                value={currentTask.blocker ? '需要协助' : '无'}
                note={
                  currentTask.blocker?.expectedResolvedAt
                    ? `预计 ${formatDateTime(currentTask.blocker.expectedResolvedAt)} 解除`
                    : '按当前计划推进'
                }
              />
            </div>
            <div className="r26-current-task__action">
              <PrimaryLink
                href={`/v2/progress?projectId=${encodeURIComponent(currentTask.projectId)}&taskId=${encodeURIComponent(currentTask.taskId)}`}
                testId="dashboard-primary-action"
              >
                提交工作进展
              </PrimaryLink>
              <p>预计用时 60 秒，不会自动完成工序</p>
            </div>
          </div>
          <aside className="r26-current-task__side" aria-label="当前任务事实">
            <div>
              <p className="r26-eyebrow">当前工序</p>
              <strong>{formatStep(currentTask.nodeCode)} · {currentTask.nodeName}</strong>
            </div>
            <dl className="r26-real-task-summary">
              <div><dt>负责人</dt><dd>{currentTask.assigneeUserName ?? '负责人待分配'}</dd></div>
              <div><dt>责任部门</dt><dd>{currentTask.assigneeDepartmentName ?? '责任部门待分配'}</dd></div>
              <div><dt>任务状态</dt><dd>{taskStatusLabel(currentTask.status)}</dd></div>
              <div><dt>材料缺口</dt><dd>{currentTask.materials.missing} 项</dd></div>
            </dl>
          </aside>
        </section>
      ) : (
        <section className="r26-empty-state">
          <strong>当前没有待处理工序</strong>
          <p>项目和权限数据已经连接成功，可从项目列表继续查看。</p>
          <Link className="r26-button r26-button--primary" href="/v2/projects">打开项目列表</Link>
        </section>
      )}

      <section className="r26-kpi-grid" aria-label="今日工作摘要">
        <Fact label="我的待办" value={String(dashboard.stats.activeTasks)} note="真实活动任务" />
        <Fact label="今天到期" value={String(dashboard.stats.dueTodayTasks)} note="按任务截止时间" />
        <Fact label="待我评审" value={String(dashboard.stats.pendingReviewTasks)} note="评审工序" />
        <Fact label="材料缺口" value={String(dashboard.stats.pendingMaterialTasks)} note="存在缺失材料的任务" />
      </section>

      <section className="r26-dashboard-lower">
        <div className="r26-card r26-next-task">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">下一项</p>
              <h2>{nextTask?.nodeName ?? '暂无下一项待办'}</h2>
            </div>
            <StatusPill tone="neutral">{nextTask ? taskStatusLabel(nextTask.status) : '空闲'}</StatusPill>
          </div>
          <p>{nextTask ? `${nextTask.projectName} · ${formatStep(nextTask.nodeCode)}` : '系统未返回第二项活动任务。'}</p>
          {nextTask ? (
            <dl>
              <div><dt>项目</dt><dd>{nextTask.projectName}</dd></div>
              <div><dt>截止</dt><dd>{formatDateTime(nextTask.dueAt)}</dd></div>
              <div><dt>材料缺口</dt><dd>{nextTask.materials.missing} 项</dd></div>
            </dl>
          ) : null}
        </div>

        <div className="r26-card r26-activity-card">
          <div className="r26-section-heading">
            <div>
              <p className="r26-eyebrow">最近动态</p>
              <h2>与你可见的更新</h2>
            </div>
            <Link href="/v2/projects">查看项目</Link>
          </div>
          <ul>
            {dashboard.recentActivity.slice(0, 5).map((activity) => (
              <li key={activity.id}>
                <span aria-hidden="true" />
                <div>
                  <strong>{activity.summary}</strong>
                  <small>{activity.actorName} · {formatDateTime(activity.createdAt)}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function formatStep(nodeCode: string) {
  const steps = [
    'PROJECT_INITIATION', 'DEVELOPMENT_REPORT', 'PAINT_DEVELOPMENT',
    'SAMPLE_COLOR_CONFIRMATION', 'COLOR_NUMBERING', 'PAINT_PROCUREMENT',
    'STANDARD_BOARD_PRODUCTION', 'BOARD_DETAIL_UPDATE', 'PERFORMANCE_TEST',
    'FIRST_UNIT_PRODUCTION_PLAN', 'TRIAL_PRODUCTION', 'CAB_REVIEW',
    'DEVELOPMENT_ACCEPTANCE', 'COLOR_CONSISTENCY_REVIEW', 'MASS_PRODUCTION_PLAN',
    'MASS_PRODUCTION', 'VISUAL_COLOR_DIFFERENCE_REVIEW', 'PROJECT_CLOSED',
  ];
  const index = steps.indexOf(nodeCode);
  return index >= 0 ? `第 ${String(index + 1).padStart(2, '0')} 步` : '当前工序';
}

function taskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: '待处理',
    READY: '待开始',
    IN_PROGRESS: '进行中',
    RETURNED: '已退回',
    APPROVED: '已通过',
    COMPLETED: '已完成',
  };
  return labels[status] ?? status;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '待前置工序确定';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatDeadline(value: string | null) {
  return value ? `${formatDateTime(value)} 截止` : '截止时间待确定';
}
