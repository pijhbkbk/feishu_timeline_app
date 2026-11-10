import Link from 'next/link';
import React from 'react';

type LinkedReviewProps = {
  projectId: string | null;
  recurringTaskId: string | null;
  periodLabel?: string | null;
  submitted: boolean;
};

export function LinkedInspectionReview({ projectId, recurringTaskId, periodLabel, submitted }: LinkedReviewProps) {
  const href = projectId ? `/projects/${encodeURIComponent(projectId)}/color-evaluation${recurringTaskId ? `?${new URLSearchParams({ recurringTaskId })}` : ''}` : null;
  return <p>
    {recurringTaskId ? `已关联月度目标：${periodLabel || '已选期次'}。` : '已关联实际目视评审。'}
    {submitted ? '事实已提交并锁定。' : recurringTaskId ? '仍为评审草稿，尚未完成月度任务。' : '仍为评审草稿，尚未完成阶段确认。'}
    {href ? <Link className="m1-button" href={href}>进入原评审流程</Link> : '关联项目待核对，请刷新记录后重试。'}
  </p>;
}
