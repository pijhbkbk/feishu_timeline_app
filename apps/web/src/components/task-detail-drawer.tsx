'use client';

import Link from 'next/link';
import React, { type ReactNode } from 'react';

import { API_BASE_URL } from '../lib/auth-client';
import { formatDate, formatDateTime } from '../lib/projects-client';
import {
  type WorkflowAction,
  type WorkflowTaskInteractionDetail,
} from '../lib/workflows-client';

type TaskDetailDrawerProps = {
  open: boolean;
  detail: WorkflowTaskInteractionDetail | null;
  isLoading: boolean;
  error: string | null;
  actingAction?: WorkflowAction | null;
  onClose: () => void;
  onReload: () => void;
  onExecuteAction?: (action: WorkflowAction) => void;
};

export function TaskDetailDrawer({
  open,
  detail,
  isLoading,
  error,
  actingAction = null,
  onClose,
  onReload,
  onExecuteAction,
}: TaskDetailDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="task-detail-drawer-backdrop" role="presentation">
      <aside
        className="task-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-drawer-title"
        data-testid="task-detail-drawer"
      >
        <div className="task-detail-drawer-header">
          <div>
            <p className="eyebrow">工序详情</p>
            <h2 id="task-detail-drawer-title">
              {detail ? `第 ${String(detail.stepNumber).padStart(2, '0')} 步 ${detail.stepName}` : '工序详情'}
            </h2>
            {detail ? (
              <p className="muted">
                {detail.statusLabel} / 第 {detail.roundNo} 轮 / {detail.department.name ?? '未分配部门'}
              </p>
            ) : (
              <p className="muted">正在同步工序执行信息。</p>
            )}
          </div>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={onClose}
            aria-label="关闭工序详情"
          >
            关闭
          </button>
        </div>

        {isLoading ? <TaskDetailSkeleton /> : null}

        {!isLoading && error ? (
          <div className="task-detail-error" role="alert">
            <strong>{isPermissionError(error) ? '无权查看该工序详情' : '工序详情加载失败'}</strong>
            <p>{isPermissionError(error) ? '当前账号没有查看该工序详情的权限。' : error}</p>
            <button type="button" className="button button-secondary button-small" onClick={onReload}>
              重新加载
            </button>
          </div>
        ) : null}

        {!isLoading && !error && detail ? (
          <>
            <div className="task-detail-drawer-body">
              <TaskHeaderStats detail={detail} />
              <TaskOverviewPanel detail={detail} />
              <TaskResponsibilityPanel detail={detail} />
              <TaskSlaPanel detail={detail} />
              <TaskMaterialsPanel detail={detail} />
              <TaskReviewPanel detail={detail} />
              <TaskFlowLogPanel detail={detail} />
            </div>
            <TaskDrawerActionBar
              detail={detail}
              actingAction={actingAction}
              onExecuteAction={onExecuteAction}
            />
          </>
        ) : null}
      </aside>
    </div>
  );
}

function TaskDetailSkeleton() {
  return (
    <div className="task-detail-skeleton" data-testid="task-detail-loading">
      <strong>正在加载工序详情…</strong>
      <span>正在读取负责人、材料、SLA 和流转记录。</span>
      <span>正在同步评审、收费、月度评审和颜色退出专项信息。</span>
    </div>
  );
}

function TaskHeaderStats({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <div className="task-detail-stats">
      <DetailStat label="负责人" value={detail.owner?.name ?? '未分配'} />
      <DetailStat label="责任部门" value={detail.department.name ?? '未分配'} />
      <DetailStat label="截止时间" value={formatDate(detail.deadline)} />
      <DetailStat
        label="逾期状态"
        value={detail.schedule.isOverdue ? `逾期 ${detail.schedule.overdueDays} 天` : '未逾期'}
        danger={detail.schedule.isOverdue}
      />
    </div>
  );
}

function TaskOverviewPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <TaskDetailSection title="工序概况">
      <div className="task-detail-grid">
        <DetailField label="所属项目" value={detail.project.name} />
        <DetailField label="颜色名称" value={detail.project.colorName} />
        <DetailField label="工序名称" value={detail.stepName} />
        <DetailField label="工作内容" value={detail.workContent} />
        <DetailField label="输出物" value={detail.outputName} />
        <DetailField label="是否主线" value={detail.isMainline ? '是' : '否'} />
        <DetailField label="是否阻塞主线" value={detail.isBlocking ? '是' : '否'} />
        <DetailField label="前置工序" value={detail.relations.previousNodeName ?? '无'} />
        <DetailField label="后续工序" value={detail.relations.nextNodeName ?? '无'} />
      </div>
    </TaskDetailSection>
  );
}

function TaskResponsibilityPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <TaskDetailSection title="责任信息">
      <div className="task-detail-grid">
        <DetailField label="责任部门" value={detail.department.name ?? '未分配'} />
        <DetailField label="负责人" value={detail.owner?.name ?? '未分配'} />
        <DetailField label="协同部门" value={formatPeopleDepartments(detail.collaborators)} />
        <DetailField label="协同人" value={formatPeople(detail.collaborators)} />
        <DetailField label="审批人 / 评审人" value={formatPeople(detail.approvers)} />
        <DetailField label="最近操作人" value={detail.relations.latestOperatorName ?? '暂无'} />
      </div>
    </TaskDetailSection>
  );
}

function TaskSlaPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  const progress = detail.schedule.progressPercent;

  return (
    <TaskDetailSection title="时间与 SLA">
      <div className="task-detail-grid">
        <DetailField label="期限规则" value={detail.schedule.ruleText} />
        <DetailField label="开始时间" value={formatDateTime(detail.schedule.startedAt)} />
        <DetailField label="截止时间" value={formatDate(detail.schedule.dueAt)} />
        <DetailField label="实际完成时间" value={formatDateTime(detail.schedule.completedAt)} />
        <DetailField
          label="剩余工作日"
          value={detail.schedule.remainingWorkdays === null ? '未设置' : `${detail.schedule.remainingWorkdays} 天`}
        />
        <DetailField label="逾期天数" value={`${detail.schedule.overdueDays} 天`} />
        <DetailField label="SLA 状态" value={detail.schedule.slaStatus} />
      </div>
      <div className="task-sla-progress" aria-label="时间进度条">
        <div
          className={detail.schedule.isOverdue ? 'task-sla-progress-bar task-sla-progress-bar-danger' : 'task-sla-progress-bar'}
          style={{ width: `${progress ?? 0}%` }}
        />
      </div>
      <p className="muted">时间进度：{progress === null ? '无固定截止时间' : `${progress}%`}</p>
    </TaskDetailSection>
  );
}

function TaskMaterialsPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <TaskDetailSection title="材料与附件">
      <div className="task-material-summary">
        <DetailStat label="必交材料" value={`${detail.requiredMaterials.length} 项`} />
        <DetailStat label="已提交材料" value={`${detail.attachments.length} 项`} />
        <DetailStat label="附件数量" value={`${detail.attachments.length} 个`} />
      </div>

      <div className="task-subsection">
        <strong>必交材料清单</strong>
        {detail.requiredMaterials.length === 0 ? (
          <p className="muted">暂无必交材料配置</p>
        ) : (
          <ul className="task-material-list">
            {detail.requiredMaterials.map((material) => (
              <li key={material.id}>
                <span>{material.name}</span>
                <em>{material.required ? '必交' : '选交'}</em>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="task-subsection">
        <strong>已提交材料</strong>
        {detail.attachments.length === 0 ? (
          <p className="muted">暂无附件</p>
        ) : (
          <div className="task-attachment-list">
            {detail.attachments.map((attachment) => (
              <article key={attachment.id} className="task-attachment-card">
                <div>
                  <strong>{attachment.fileName}</strong>
                  <p className="muted">
                    {attachment.uploadedByName ?? '未知上传人'} / {formatDateTime(attachment.uploadedAt)} / {formatFileSize(attachment.fileSize)}
                  </p>
                  <p className="muted">
                    版本号：{attachment.versionNo ?? '未记录'} / 材料状态：{attachment.status}
                  </p>
                </div>
                <div className="task-actions">
                  <a
                    className="button button-secondary button-small"
                    href={toApiUrl(attachment.previewUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看
                  </a>
                  <a
                    className="button button-secondary button-small"
                    href={toApiUrl(attachment.downloadUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Link href={`/projects/${detail.projectId}/materials`} className="button button-secondary button-small">
        上传材料
      </Link>
    </TaskDetailSection>
  );
}

function TaskReviewPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  if (detail.nodeCode === 'CAB_REVIEW') {
    return <Step12ReviewActions detail={detail} />;
  }

  if (detail.nodeCode === 'DEVELOPMENT_ACCEPTANCE') {
    return <Step13FeeSummary detail={detail} />;
  }

  if (detail.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') {
    return <Step17MonthlySummary detail={detail} />;
  }

  if (detail.nodeCode === 'PROJECT_CLOSED') {
    return <Step18ColorExitSummary detail={detail} />;
  }

  return (
    <TaskDetailSection title="评审 / 审批">
      {detail.reviewDetail.records.length === 0 ? (
        <p className="muted">暂无评审 / 审批记录</p>
      ) : (
        <div className="task-review-records">
          {detail.reviewDetail.records.map((record) => (
            <article key={record.id} className="task-review-record">
              <strong>{record.resultLabel}</strong>
              <p className="muted">
                {record.reviewerName ?? '未指定评审人'} / 第 {record.reviewRound} 轮 / {formatDateTime(record.reviewedAt)}
              </p>
              {record.comment ? <p>{record.comment}</p> : null}
            </article>
          ))}
        </div>
      )}
    </TaskDetailSection>
  );
}

export function Step12ReviewActions({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <TaskDetailSection title="第 12 步样车驾驶室评审">
      <div className="task-detail-grid">
        <DetailField label="评审结论" value={detail.reviewDetail.latestResultLabel ?? '未形成结论'} />
        <DetailField label="不通过原因" value={detail.reviewDetail.rejectReason ?? '未记录'} />
        <DetailField label="整改要求" value={detail.reviewDetail.reworkRequirement ?? '未记录'} />
        <DetailField label="整改责任人" value={detail.reviewDetail.reworkOwnerName ?? '未分配'} />
        <DetailField label="评审通过时间" value={formatDateTime(detail.reviewDetail.reviewPassAt)} />
        <DetailField
          label="历史轮次"
          value={detail.reviewDetail.historyRounds.map((round) => `第 ${round.roundNo} 轮`).join(' / ') || '暂无历史轮次'}
        />
      </div>
      <div className="task-special-actions">
        <span>通过</span>
        <span>不通过 / 退回</span>
      </div>
    </TaskDetailSection>
  );
}

export function Step13FeeSummary({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  const fee = detail.feeSummary;

  return (
    <TaskDetailSection title="第 13 步颜色开发收费">
      <div className="task-detail-grid">
        <DetailField label="固定金额" value={`${fee?.fixedAmount ?? 10000} 元`} />
        <DetailField label="收费状态" value={fee?.status ?? '未记录'} />
        <DetailField label="收费凭证" value={`${fee?.voucherCount ?? 0} 个附件`} />
        <DetailField label="财务确认人" value={fee?.financeConfirmerName ?? '未确认'} />
      </div>
    </TaskDetailSection>
  );
}

export function Step17MonthlySummary({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  const summary = detail.monthlyReviewSummary;

  return (
    <TaskDetailSection title="第 17 步整车色差一致性评审">
      <div className="task-detail-grid">
        <DetailField label="周期" value={`${summary?.totalPeriods ?? 12} 个月`} />
        <DetailField label="完成进度" value={`已完成 ${summary?.completedPeriods ?? 0} / ${summary?.totalPeriods ?? 12}`} />
        <DetailField label="本月状态" value={summary?.currentMonthTask?.statusLabel ?? '未排期'} />
        <DetailField label="逾期月份" value={`${summary?.overduePeriods ?? 0} 个月`} />
      </div>
      <Link href={`/projects/${detail.projectId}/reviews`} className="button button-secondary button-small">
        查看月度评审台账
      </Link>
    </TaskDetailSection>
  );
}

export function Step18ColorExitSummary({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  const summary = detail.colorExitSummary;

  return (
    <TaskDetailSection title="第 18 步颜色退出">
      <div className="task-detail-grid">
        <DetailField label="年产量" value={summary?.annualOutput === null || summary?.annualOutput === undefined ? '未录入' : `${summary.annualOutput} 台`} />
        <DetailField label="退出阈值" value={summary?.exitThreshold === null || summary?.exitThreshold === undefined ? '未设置' : `${summary.exitThreshold} 台`} />
        <DetailField label="系统建议" value={summary?.systemSuggestionLabel ?? '未生成'} />
        <DetailField label="人工结论" value={summary?.finalDecisionLabel ?? '未录入'} />
        <DetailField label="退出原因" value={summary?.exitReason ?? '未记录'} />
        <DetailField label="生效日期" value={formatDate(summary?.effectiveDate)} />
      </div>
    </TaskDetailSection>
  );
}

function TaskFlowLogPanel({ detail }: { detail: WorkflowTaskInteractionDetail }) {
  return (
    <TaskDetailSection title="流转记录">
      {detail.flowLogs.length === 0 ? (
        <p className="muted">暂无流转记录</p>
      ) : (
        <div className="task-flow-log-list">
          {detail.flowLogs.map((log) => (
            <article key={log.id} className="task-flow-log-card">
              <div className="timeline-header">
                <strong>{log.actionLabel}</strong>
                <span>{formatDateTime(log.createdAt)}</span>
              </div>
              <p className="muted">
                {log.operatorName ?? '系统'}
                {log.fromNodeName ? ` / ${log.fromNodeName}` : ''}
                {log.toNodeName ? ` → ${log.toNodeName}` : ''}
              </p>
              {log.summary ? <p>{log.summary}</p> : null}
            </article>
          ))}
        </div>
      )}
    </TaskDetailSection>
  );
}

function TaskDrawerActionBar({
  detail,
  actingAction,
  onExecuteAction,
}: {
  detail: WorkflowTaskInteractionDetail;
  actingAction: WorkflowAction | null;
  onExecuteAction?: ((action: WorkflowAction) => void) | undefined;
}) {
  const availableActions = detail.availableActions.filter((item) => item.action !== 'START');

  return (
    <div className="task-detail-action-bar">
      <button type="button" className="button button-secondary button-small" disabled>
        保存
      </button>
      {detail.availableActions.some((item) => item.action === 'START') ? (
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={!onExecuteAction || actingAction === 'START'}
          onClick={() => onExecuteAction?.('START')}
        >
          {actingAction === 'START' ? '处理中…' : '开始处理'}
        </button>
      ) : null}
      {availableActions.map((item) => (
        <button
          key={item.action}
          type="button"
          className={`button button-small ${getActionButtonClass(item.action)}`}
          disabled={!onExecuteAction || actingAction === item.action}
          onClick={() => onExecuteAction?.(item.action)}
        >
          {actingAction === item.action ? '处理中…' : getDrawerActionLabel(detail, item)}
        </button>
      ))}
      <button type="button" className="button button-secondary button-small" disabled>
        转交负责人
      </button>
      {detail.availableActions.length === 0 ? <span className="muted">当前无可执行操作</span> : null}
    </div>
  );
}

function TaskDetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="task-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={danger ? 'task-detail-stat task-detail-stat-danger' : 'task-detail-stat'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="task-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPeople(people: WorkflowTaskInteractionDetail['collaborators']) {
  return people.length > 0 ? people.map((person) => person.name).join(' / ') : '暂无';
}

function formatPeopleDepartments(people: WorkflowTaskInteractionDetail['collaborators']) {
  const departments = [...new Set(people.map((person) => person.departmentName).filter(Boolean))];
  return departments.length > 0 ? departments.join(' / ') : '暂无';
}

function formatFileSize(fileSize: number) {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function getDrawerActionLabel(
  detail: WorkflowTaskInteractionDetail,
  item: WorkflowTaskInteractionDetail['availableActions'][number],
) {
  if (item.action === 'SUBMIT' || item.action === 'COMPLETE') {
    return '完成工序';
  }

  if (detail.nodeCode === 'CAB_REVIEW' && item.action === 'REJECT') {
    return '不通过 / 退回';
  }

  return item.label;
}

function getActionButtonClass(action: WorkflowAction) {
  if (action === 'APPROVE' || action === 'COMPLETE' || action === 'SUBMIT') {
    return 'button-primary';
  }

  if (action === 'REJECT' || action === 'RETURN') {
    return 'button-danger';
  }

  return 'button-secondary';
}

function toApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function isPermissionError(error: string) {
  return error.includes('403') || error.includes('无权') || error.includes('Forbidden');
}
