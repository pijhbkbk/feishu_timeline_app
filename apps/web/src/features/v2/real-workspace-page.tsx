'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { R26FlowMap } from './flow-map';
import { CloseIcon } from './icons';
import { R26_REAL_FLOW_GEOMETRY } from './real-flow-geometry';
import type {
  R26FlowMapNode,
  R26TaskDetail,
  R26TaskResponse,
  R26WorkspaceResponse,
} from './real-types';
import { RealDataState } from './real-ui';
import type { R26FlowNode, R26NodeStatus } from './types';
import { StatusPill } from './ui';
import { useR26ReadOnlyData } from './use-r26-readonly-data';

const STATUS_LABELS: Record<R26NodeStatus, string> = {
  NOT_STARTED: '未开始',
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  PENDING_REVIEW: '待评审',
  COMPLETED: '已完成',
  COMPLETED_LATE: '逾期完成',
  OVERDUE: '已逾期',
  RETURNED: '已退回',
  MONTHLY_TRACKING: '月度跟踪中',
  EXIT_PENDING: '待人工决定',
};

export function RealWorkspacePage({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNodeCode, setSelectedNodeCode] = useState<string | null>(null);
  const initializedSelection = useRef(false);
  const workspacePath = `/v2/projects/${encodeURIComponent(projectId)}/workspace`;
  const { data, error, loading } =
    useR26ReadOnlyData<R26WorkspaceResponse>(workspacePath);
  const nodes = useMemo(
    () => data?.flowMap.nodes.map(toDisplayNode) ?? [],
    [data],
  );

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const taskId = searchParams.get('taskId');
    const nodeCode = searchParams.get('nodeCode');
    const queryNode =
      (taskId ? nodes.find((node) => node.taskId === taskId) : null) ??
      (nodeCode ? nodes.find((node) => node.code === nodeCode) : null) ??
      null;

    if (queryNode) {
      setSelectedNodeCode(queryNode.code);
      initializedSelection.current = true;
      return;
    }
    if (initializedSelection.current) {
      return;
    }
    initializedSelection.current = true;
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSelectedNodeCode(null);
      return;
    }
    setSelectedNodeCode(
      data?.flowMap.currentStepCode ??
      nodes.find((node) => node.status === 'IN_PROGRESS')?.code ??
      nodes[0]?.code ??
      null,
    );
  }, [data?.flowMap.currentStepCode, nodes, searchParams]);

  const selectedNode =
    nodes.find((node) => node.code === selectedNodeCode) ?? null;
  const taskPath = selectedNode?.taskId
    ? `/v2/tasks/${encodeURIComponent(selectedNode.taskId)}`
    : null;
  const taskQuery = useR26ReadOnlyData<R26TaskResponse>(taskPath);

  if (loading || error || !data) {
    return <RealDataState loading={loading} error={error} label="正在读取真实项目工作区…" />;
  }

  function selectNode(node: R26FlowNode) {
    setSelectedNodeCode(node.code);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('taskId');
    params.delete('nodeCode');
    if (node.taskId) {
      params.set('taskId', node.taskId);
    } else {
      params.set('nodeCode', node.code);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeDetail() {
    setSelectedNodeCode(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('taskId');
    params.delete('nodeCode');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const attention = [
    `逾期 ${data.flowMap.nodes.filter((node) => node.status === 'OVERDUE').length}`,
    `退回 ${data.flowMap.nodes.filter((node) => node.status === 'RETURNED').length}`,
    `待评审 ${data.flowMap.nodes.filter((node) => node.status === 'PENDING_REVIEW').length}`,
  ].join(' · ');

  return (
    <div
      className="r26-page r26-workspace-page"
      data-testid="r26-workspace"
      data-source="database"
    >
      <div className="r26-readonly-banner" role="status">
        <strong>Gate 2 · 真实只读工作区</strong>
        <span>18 个节点、工序详情、成员与分工均来自 staging；页面不提供流程操作。</span>
      </div>
      <header className="r26-project-header">
        <div className="r26-project-header__identity">
          <Link href="/v2/projects" aria-label="返回项目列表">项目列表</Link>
          <span aria-hidden="true">/</span>
          <div>
            <span className="r26-color-swatch r26-real-color" aria-hidden="true" />
            <div>
              <h1>{data.flowMap.colorName ?? data.project.name}</h1>
              <p>{data.project.name}</p>
            </div>
          </div>
        </div>
        <dl className="r26-project-header__facts">
          <div><dt>当前工序</dt><dd>{data.flowMap.currentStepName}</dd></div>
          <div><dt>负责人</dt><dd>{data.flowMap.currentOwner ?? '尚未分配'} · {data.flowMap.currentDepartment ?? '部门待定'}</dd></div>
          <div><dt>流程进度</dt><dd>{completedNodeCount(data.flowMap.nodes)} / 18</dd></div>
          <div><dt>最近更新</dt><dd>{formatDateTime(data.flowMap.lastUpdatedAt)}</dd></div>
        </dl>
      </header>

      <nav className="r26-workspace-jumps" aria-label="项目工作区内容">
        <a href="#flow-map">实时流程地图</a>
        <a href="#members">项目成员与分工</a>
        <a href="#assignment-preview">自动分配预览</a>
      </nav>

      <div id="flow-map" className={`r26-workspace-layout ${selectedNode ? 'has-detail' : ''}`}>
        <R26FlowMap
          selectedNode={selectedNode}
          onSelectNode={selectNode}
          nodes={nodes}
          createdTaskIds={nodes.flatMap((node) => node.taskId ? [node.taskId] : [])}
          currentSummary={{
            currentStep: data.flowMap.currentStepName,
            attention,
          }}
          ignorePrototypeOverrides
        />
        {selectedNode ? (
          <RealTaskDetail
            node={selectedNode}
            rawNode={data.flowMap.nodes.find((node) => node.nodeCode === selectedNode.code) ?? null}
            task={taskQuery.data?.task ?? null}
            loading={taskQuery.loading}
            error={taskQuery.error}
            onClose={closeDetail}
          />
        ) : null}
      </div>

      <section id="members" className="r26-card r26-real-section" data-testid="r26-member-assignments">
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">真实项目组织</p>
            <h2>项目成员与分工</h2>
          </div>
          <span>{data.memberAssignments.length} 位成员 · {data.organization.departments.length} 个有效部门</span>
        </div>
        <div className="r26-member-grid">
          {data.memberAssignments.map((member) => (
            <article key={member.id} className="r26-member-card">
              <header>
                <span>{member.name.slice(0, 1)}</span>
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.departmentName ?? '未设置部门'} · {member.memberTypeLabel}</p>
                </div>
                {member.isPrimary ? <StatusPill tone="current">主责</StatusPill> : null}
              </header>
              <dl>
                <div><dt>项目职责</dt><dd>{member.projectResponsibility}</dd></div>
                <div><dt>默认负责工序</dt><dd>{joinSteps(member.defaultNodes)}</dd></div>
                <div><dt>当前任务</dt><dd>{member.currentTasks.map((task) => task.stepName).join('、') || '暂无'}</dd></div>
                <div><dt>协同 / 评审</dt><dd>{member.relations.map((relation) => `${relation.stepName}（${relation.relation}）`).join('、') || '暂无'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <div className="r26-organization-summary">
          {data.organization.departments.map((department) => (
            <span key={department.id}>{department.name} · {department.activeUserCount} 人</span>
          ))}
        </div>
      </section>

      <section
        id="assignment-preview"
        className="r26-card r26-real-section"
        data-testid="r26-assignment-preview"
      >
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">服务端候选规则</p>
            <h2>自动分配预览</h2>
          </div>
          <span>只读预览 · 无保存按钮</span>
        </div>
        <div className="r26-assignment-table" role="table" aria-label="18 个工序自动分配预览">
          <div className="r26-assignment-table__header" role="row">
            <span>步骤 / 工序</span>
            <span>主责部门</span>
            <span>建议负责人</span>
            <span>协同 / 评审</span>
            <span>匹配状态</span>
          </div>
          {data.assignmentPreview.map((assignment) => (
            <div className="r26-assignment-table__row" role="row" key={assignment.nodeCode}>
              <div>
                <small>第 {String(assignment.stepNumber).padStart(2, '0')} 步</small>
                <strong>{assignment.stepName}</strong>
              </div>
              <span>{assignment.primaryDepartment?.name ?? '部门规则未命中'}</span>
              <span>{assignment.suggestedOwner?.name ?? '尚未分配'}</span>
              <span>
                {uniquePersonNames([
                  ...assignment.collaborators,
                  ...assignment.reviewers,
                ]) || '无'}
              </span>
              <div>
                <StatusPill tone={assignment.assignmentStatus === 'UNASSIGNED' ? 'risk' : assignment.assignmentStatus === 'ASSIGNED' ? 'completed' : 'current'}>
                  {assignmentStatusLabel(assignment.assignmentStatus)}
                </StatusPill>
                <small>{assignment.unassignedReason ?? assignmentSourceLabel(assignment.assignmentSource)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="r26-card r26-workspace-activity">
        <div className="r26-section-heading">
          <div>
            <p className="r26-eyebrow">最近活动</p>
            <h2>项目事实按时间保留</h2>
          </div>
          <span>数据库审计记录</span>
        </div>
        <ol>
          {data.flowMap.recentActivities.slice(0, 6).map((activity) => (
            <li key={activity.id}>
              <time>{formatDateTime(activity.createdAt)}</time>
              <strong>{activity.summary}</strong>
              <span>{activity.operatorName} · {activity.actionLabel}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function RealTaskDetail({
  node,
  rawNode,
  task,
  loading,
  error,
  onClose,
}: {
  node: R26FlowNode;
  rawNode: R26FlowMapNode | null;
  task: R26TaskDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <aside className="r26-task-detail" aria-label={`${node.name}工序详情`} data-testid="r26-task-detail">
      <header className="r26-task-detail__header">
        <div>
          <p>第 {String(node.step).padStart(2, '0')} 步 · 第 {node.round || 1} 轮</p>
          <h2>{node.name}</h2>
          <StatusPill tone={statusTone(node.status)}>{STATUS_LABELS[node.status]}</StatusPill>
        </div>
        <button type="button" aria-label="关闭工序详情" onClick={onClose}><CloseIcon /></button>
      </header>
      <div className="r26-task-detail__body">
        <section className="r26-task-conclusion">
          <span>当前结论</span>
          <strong>{taskConclusion(node, task)}</strong>
          <p>{task?.relations.nextNodeName ? `下一步：${task.relations.nextNodeName}` : '下一步由流程状态与人工授权共同决定。'}</p>
        </section>
        {loading ? <p className="r26-inline-state">正在读取工序详情…</p> : null}
        {error ? <p className="r26-inline-state is-error">{error}</p> : null}

        <DetailSection title="责任信息">
          <DetailGrid items={[
            ['负责人', task?.owner?.name ?? rawNode?.suggestedOwner?.name ?? '尚未分配'],
            ['主责部门', task?.department.name ?? rawNode?.primaryDepartment?.name ?? '尚未匹配'],
            ['协同人', rawNode ? rawNode.collaborators.map((person) => person.name).join('、') || '无' : task?.collaborators.map((person) => person.name).join('、') || '无'],
            ['评审人', rawNode ? rawNode.reviewers.map((person) => person.name).join('、') || '无' : task?.approvers.map((person) => person.name).join('、') || '无'],
          ]} />
        </DetailSection>
        <DetailSection title="时间与进度">
          <DetailGrid items={[
            ['开始时间', formatDateTime(task?.schedule.startedAt ?? null)],
            ['截止时间', formatDateTime(task?.schedule.effectiveDueAt ?? rawNode?.dueAt ?? null)],
            ['SLA 状态', task?.schedule.slaStatus ?? (rawNode?.isOverdue ? '已逾期' : '待计算')],
            ['逾期天数', `${task?.schedule.overdueDays ?? rawNode?.overdueDays ?? 0} 天`],
          ]} />
        </DetailSection>
        <DetailSection title="工作要求与输出物">
          <p>{task?.workContent ?? '当前节点尚未创建任务，以下为自动分配预览。'}</p>
          <div className="r26-output-box"><span>预期输出</span><strong>{task?.outputName ?? '工序任务创建后确定'}</strong></div>
        </DetailSection>
        <DetailSection title="材料完整性">
          <div className="r26-material-summary">
            <strong>{task?.attachments.length ?? rawNode?.materialProgress.submitted ?? 0} / {task?.requiredMaterials.length ?? rawNode?.materialProgress.required ?? 0}</strong>
            <span>{rawNode?.materialProgress.missing ? `仍缺 ${rawNode.materialProgress.missing} 项必交材料` : '当前无缺失项'}</span>
          </div>
          {task?.requiredMaterials.length ? (
            <ul className="r26-material-list">
              {task.requiredMaterials.map((material, index) => {
                const name = material.name ?? material.label ?? `材料 ${index + 1}`;
                const uploaded = task.attachments.some((attachment) =>
                  attachment.materialType === material.code || attachment.fileName.includes(name),
                );
                return (
                  <li key={`${name}-${index}`} className={uploaded ? 'is-complete' : 'is-missing'}>
                    <span aria-hidden="true">{uploaded ? '✓' : '!'}</span>
                    <div><strong>{name}</strong><small>{uploaded ? '已上传' : '缺失'}</small></div>
                  </li>
                );
              })}
            </ul>
          ) : <p>该工序未配置必交材料。</p>}
        </DetailSection>
        {node.step === 17 ? (
          <DetailSection title="月度评审">
            <DetailGrid items={[
              ['完成进度', task?.monthlyReviewSummary?.progressText ?? rawNode?.monthlyReview?.progressText ?? '尚未生成月度实例'],
              ['已完成', `${task?.monthlyReviewSummary?.completedPeriods ?? rawNode?.monthlyReview?.completedPeriods ?? 0} / ${task?.monthlyReviewSummary?.totalPeriods ?? rawNode?.monthlyReview?.totalPeriods ?? 12}`],
              ['逾期月份', `${task?.monthlyReviewSummary?.overduePeriods ?? rawNode?.monthlyReview?.overduePeriods ?? 0} 个`],
              ['记录原则', '每月独立实例'],
            ]} />
          </DetailSection>
        ) : null}
        {node.step === 18 ? (
          <DetailSection title="颜色退出决定">
            <DetailGrid items={[
              ['年产量', task?.colorExitSummary?.annualOutput == null ? '待统计' : `${task.colorExitSummary.annualOutput} 台`],
              ['退出阈值', task?.colorExitSummary?.exitThreshold == null ? '待配置' : `${task.colorExitSummary.exitThreshold} 台`],
              ['系统建议', task?.colorExitSummary?.systemSuggestionLabel ?? exitLabel(rawNode?.colorExit?.systemSuggestion) ?? '暂无建议'],
              ['人工决定', task?.colorExitSummary?.finalDecisionLabel ?? exitLabel(rawNode?.colorExit?.finalDecision) ?? '待授权人员决定'],
            ]} />
            <p>系统建议只提供参考，不能代替授权人员的人工决定。</p>
          </DetailSection>
        ) : null}
        <DetailSection title="最近流转与审计">
          {task?.flowLogs.length ? (
            <ol className="r26-detail-events">
              {task.flowLogs.slice(0, 8).map((event, index) => (
                <li key={event.id ?? `${event.createdAt}-${index}`}>
                  <time>{formatDateTime(event.createdAt ?? null)}</time>
                  <p>{event.summary ?? event.actionLabel ?? '流程记录'}</p>
                </li>
              ))}
            </ol>
          ) : <p>当前没有流转记录。</p>}
        </DetailSection>
      </div>
      <footer className="r26-task-detail__footer">
        <div className="r26-readonly-footer">
          <strong>只读查看</strong>
          <span>{rawNode?.availableActions.length ? `后端可用动作：${rawNode.availableActions.map((action) => action.label).join('、')}` : '当前无可执行动作'}</span>
        </div>
      </footer>
    </aside>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="r26-detail-section"><h3>{title}</h3>{children}</section>;
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="r26-detail-grid">
      {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function toDisplayNode(node: R26FlowMapNode): R26FlowNode {
  const geometry = R26_REAL_FLOW_GEOMETRY[node.nodeCode] ?? {
    x: 625,
    y: 80 + (node.stepNumber - 1) * 110,
    width: 190,
    height: 92,
    shape: 'rounded' as const,
  };
  const status = isNodeStatus(node.status) ? node.status : 'NOT_STARTED';

  return {
    step: node.stepNumber,
    code: node.nodeCode,
    name: node.stepName,
    ...(geometry.shortName ? { shortName: geometry.shortName } : {}),
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    shape: geometry.shape,
    status,
    owner: node.ownerName ?? node.suggestedOwner?.name ?? '尚未分配',
    department: node.departmentName ?? node.primaryDepartment?.name ?? '部门待定',
    deadline: node.isOverdue
      ? `逾期 ${node.overdueDays} 天`
      : node.dueAt
        ? formatDateTime(node.dueAt)
        : '等待前置工序',
    taskId: node.taskId,
    round: node.roundNo || 1,
    collaborators: node.collaborators.map((person) => person.name),
    approver: node.reviewers.map((person) => person.name).join('、') || '无',
    startedAt: '任务详情中查看',
    remainingDays: null,
    overdueDays: node.overdueDays,
    requirement: '工序详情由真实任务接口提供。',
    output: '工序输出物',
    requiredMaterials: Array.from({ length: node.materialProgress.required }, (_, index) => `必交材料 ${index + 1}`),
    uploadedMaterials: Array.from({ length: node.materialProgress.submitted }, (_, index) => `已上传材料 ${index + 1}`),
    missingMaterials: Array.from({ length: node.materialProgress.missing }, (_, index) => `缺失材料 ${index + 1}`),
    recentEvents: [],
  };
}

function isNodeStatus(value: string): value is R26NodeStatus {
  return value in STATUS_LABELS;
}

function statusTone(status: R26NodeStatus) {
  if (status === 'COMPLETED' || status === 'COMPLETED_LATE') return 'completed';
  if (status === 'OVERDUE' || status === 'RETURNED') return 'risk';
  if (status === 'PENDING_REVIEW') return 'review';
  if (status === 'MONTHLY_TRACKING') return 'tracking';
  if (status === 'EXIT_PENDING') return 'exit';
  if (status === 'IN_PROGRESS') return 'current';
  return 'neutral';
}

function taskConclusion(node: R26FlowNode, task: R26TaskDetail | null) {
  if (task?.colorExitSummary) {
    return task.colorExitSummary.finalDecisionLabel
      ? `人工决定：${task.colorExitSummary.finalDecisionLabel}`
      : `系统建议：${task.colorExitSummary.systemSuggestionLabel ?? '暂无'}；仍需人工决定。`;
  }
  if (task?.monthlyReviewSummary) {
    return `${task.monthlyReviewSummary.progressText}，历史月份独立保留。`;
  }
  if (task?.reviewDetail.latestResultLabel) {
    return `最近评审结论：${task.reviewDetail.latestResultLabel}。`;
  }
  if (node.missingMaterials.length > 0) {
    return `${STATUS_LABELS[node.status]}，仍缺 ${node.missingMaterials.length} 项必交材料。`;
  }
  return `${STATUS_LABELS[node.status]}，当前材料记录无缺失项。`;
}

function completedNodeCount(nodes: R26FlowMapNode[]) {
  return nodes.filter((node) => node.status === 'COMPLETED' || node.status === 'COMPLETED_LATE').length;
}

function formatDateTime(value: string | null) {
  if (!value) return '待确定';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function joinSteps(steps: Array<{ stepNumber: number; stepName: string }>) {
  return steps.length
    ? steps.map((step) => `${String(step.stepNumber).padStart(2, '0')} · ${step.stepName}`).join('、')
    : '暂无默认工序';
}

function assignmentStatusLabel(status: string) {
  return status === 'ASSIGNED' ? '已分配' : status === 'SUGGESTED' ? '建议匹配' : '未分配';
}

function assignmentSourceLabel(source: string) {
  const labels: Record<string, string> = {
    WORKFLOW_TASK: '来自真实工序任务',
    PROJECT_MEMBER_RULE: '来自项目成员规则',
    DEPARTMENT_POOL: '来自部门有效用户候选池',
    NONE: '没有匹配来源',
  };
  return labels[source] ?? source;
}

function uniquePersonNames(people: Array<{ id: string; name: string }>) {
  return [...new Map(people.map((person) => [person.id, person.name])).values()].join('、');
}

function exitLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    EXIT: '建议退出',
    RETAIN: '建议保留',
    OBSERVE: '建议观察',
  };
  return value ? labels[value] ?? value : null;
}
