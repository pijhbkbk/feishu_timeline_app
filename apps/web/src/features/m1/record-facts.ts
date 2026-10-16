import type { SampleConfirmationSummary, SampleListItem, SamplesWorkspaceResponse } from '../../lib/samples-client';
import type { R26ProgressResponse, R26MaterialVersion } from '../v2/real-types';

export type TaskSample = Omit<SampleListItem, 'imageCount' | 'latestImageAttachmentId' | 'versionCount'>;
export type TaskSampleFacts = {
  taskId: string;
  nodeCode: string;
  samples: TaskSample[];
  confirmations: SampleConfirmationSummary[];
};
export type TaskSamplesResponse = SamplesWorkspaceResponse & { taskFacts?: TaskSampleFacts };

export function readableFlowSummary(summary: string) {
  const labels: Record<string, string> = { approve: '通过', reject: '不通过', return: '退回', complete: '完成', submit: '提交', start: '开始', withdraw: '撤回' };
  return summary.replace(/执行\s+(approve|reject|return|complete|submit|start|withdraw)\b/gi, (_, action: string) => `：${labels[action.toLowerCase()]}`);
}

export function canRecordNode(context: R26ProgressResponse) {
  return context.progressSubmissionEnabled &&
    ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'].includes(context.task.status) &&
    context.availableActions.some(action => action.action === 'SUBMIT_PROGRESS');
}

export function requireTaskSampleFacts(response: TaskSamplesResponse, taskId: string, nodeCode: string) {
  const facts = response.taskFacts;
  if (!facts || facts.taskId !== taskId || facts.nodeCode !== nodeCode) throw new Error('本轮样板记录未能读取，请重新加载。');
  return facts;
}

export function selectRecordedSample(facts: TaskSampleFacts, preferredId?: string) {
  const confirmation = facts.confirmations.find(item => item.taskId === facts.taskId);
  return facts.samples.find(sample => sample.id === (confirmation?.sampleId ?? preferredId)) ??
    facts.samples.find(sample => sample.isCurrent) ?? facts.samples[0] ?? null;
}

export function paintFields(sample: TaskSample) {
  return { date: sample.producedAt?.slice(0, 10) ?? '', sampleNo: sample.sampleNo, sampleName: sample.sampleName, comment: sample.remark ?? '' };
}

export function materialUploadTarget(taskId: string, materialType: string, current: R26MaterialVersion[]) {
  const previous = current.find(material => material.materialType === materialType);
  return {
    path: `/v2/tasks/${encodeURIComponent(taskId)}/materials${previous ? `/${encodeURIComponent(previous.id)}/versions` : ''}`,
    replacesAttachmentId: previous?.id ?? null,
  };
}
