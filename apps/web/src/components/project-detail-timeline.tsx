'use client';

import Link from 'next/link';

import {
  formatDate,
  formatDateTime,
  type ProjectTimelineResponse,
} from '../lib/projects-client';
import {
  COLOR_EXIT_SUGGESTION_LABELS,
  getTimelineNodeStatusLabel,
  getTimelineNodeTone,
} from '../lib/status-labels';
import { getReviewResultLabel, getRecurringTaskStatusLabel } from '../lib/workflows-client';

export function ProjectDetailTimeline({
  timeline,
}: {
  timeline: ProjectTimelineResponse;
}) {
  return (
    <section className="page-card" data-testid="project-detail-timeline">
      <div className="section-header">
        <div>
          <p className="eyebrow">项目时间线</p>
          <h2 className="section-title">项目完整节点时间线</h2>
          <p className="muted">
            最近更新：{formatDateTime(timeline.lastUpdatedAt)}。展示 18 个节点的开始、截止、完成、责任和输出物。
          </p>
        </div>
        <div className="progress-ring">
          <strong>{timeline.project.progressPercent}%</strong>
          <span>总进度</span>
        </div>
      </div>
      <div className="single-project-timeline">
        {timeline.nodes.map((node) => (
          <article
            key={node.nodeCode}
            className={`single-project-node single-project-node-${getTimelineNodeTone(node.status)}`}
          >
            <div className="single-project-node-index">
              <span>{String(node.stepNumber).padStart(2, '0')}</span>
            </div>
            <div className="single-project-node-body">
              <div className="timeline-header">
                <div>
                  <strong>{node.nodeName}</strong>
                  <p className="muted">{getTimelineNodeStatusLabel(node.status)}</p>
                </div>
                {node.isOverdue ? <span className="overdue-badge">逾期 {node.overdueDays} 天</span> : null}
              </div>
              <div className="timeline-detail-grid">
                <TimelineField label="开始时间" value={formatDateTime(node.startTime)} />
                <TimelineField label="截止时间" value={formatDate(node.dueAt)} />
                <TimelineField label="实际完成时间" value={formatDateTime(node.completedAt)} />
                <TimelineField label="责任部门" value={node.responsibleDepartment ?? '未分配'} />
                <TimelineField label="负责人" value={node.ownerName ?? '未分配'} />
                <TimelineField label="输出物" value={node.output} />
                <TimelineField label="附件数量" value={`${node.attachmentCount} 个`} />
              </div>
              {node.reviewGate ? <ReviewGateSummary node={node} /> : null}
              {node.monthlyReview ? (
                <div className="timeline-special-block">
                  <strong>第 17 步月度评审进度</strong>
                  <p>
                    {node.monthlyReview.progressText}，逾期 {node.monthlyReview.overduePeriods} 个周期。
                    本月任务：
                    {node.monthlyReview.currentMonthTask
                      ? `${node.monthlyReview.currentMonthTask.periodLabel} / ${getRecurringTaskStatusLabel(
                          node.monthlyReview.currentMonthTask.status,
                        )}`
                      : '未排期'}
                  </p>
                  <Link href={`/projects/${timeline.project.id}/reviews`} className="table-link">
                    查看整车色差一致性评审台账
                  </Link>
                </div>
              ) : null}
              {node.colorExit ? (
                <div className="timeline-special-block">
                  <strong>第 18 步颜色退出治理</strong>
                  <p>
                    年产量 {node.colorExit.annualOutput ?? '未录入'}，退出阈值{' '}
                    {node.colorExit.exitThreshold ?? '未设置'}，系统建议{' '}
                    {node.colorExit.systemSuggestion
                      ? COLOR_EXIT_SUGGESTION_LABELS[node.colorExit.systemSuggestion]
                      : '未生成'}
                    ，人工结论{' '}
                    {node.colorExit.finalDecision
                      ? COLOR_EXIT_SUGGESTION_LABELS[node.colorExit.finalDecision]
                      : '未录入'}
                    。
                  </p>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelineField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReviewGateSummary({
  node,
}: {
  node: ProjectTimelineResponse['nodes'][number];
}) {
  if (!node.reviewGate) {
    return null;
  }

  return (
    <div className="timeline-special-block">
      <strong>第 12 步评审门禁</strong>
      <p>
        评审结论：
        {node.reviewGate.reviewConclusion
          ? getReviewResultLabel(node.reviewGate.reviewConclusion)
          : '未形成结论'}
        ，评审通过时间：{formatDateTime(node.reviewGate.reviewPassAt)}，退回轮次：
        {node.reviewGate.returnRounds} 次。
      </p>
    </div>
  );
}
