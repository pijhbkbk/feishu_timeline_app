import {
  PerformanceTestResult,
  PerformanceTestStatus,
} from '@prisma/client';

export function getPerformanceTestStageIssue(input: {
  procurementCompleted: boolean;
  hasActiveTask: boolean;
}) {
  if (!input.procurementCompleted) {
    return '采购节点尚未完成，不能进入性能试验。';
  }

  if (!input.hasActiveTask) {
    return '当前没有活跃的涂料性能试验任务。';
  }

  return null;
}

export function getPerformanceTestCompletionIssue(
  items: Array<{
    status: PerformanceTestStatus;
    conclusion: string | null;
  }>,
) {
  if (items.length === 0) {
    return '至少需要一条性能试验记录后才能完成节点。';
  }

  const completedItems = items.filter(
    (item) =>
      item.status === PerformanceTestStatus.SUBMITTED &&
      Boolean(item.conclusion?.trim()),
  );

  if (completedItems.length === 0) {
    return '没有有效试验结论时不能完成性能试验节点。';
  }

  return null;
}

export function getPerformanceTestSubmitIssue(input: {
  standardValue: string | null;
  actualValue: string | null;
  result: PerformanceTestResult | null;
  conclusion: string | null;
  testedById: string | null;
  testedAt: Date | null;
  reportAttachmentId: string | null;
  sampleId: string | null;
  relatedObjectName: string | null;
}) {
  if (!input.sampleId && !input.relatedObjectName?.trim()) {
    return '必须选择关联样板或填写关联对象。';
  }

  if (!input.standardValue?.trim()) {
    return '标准值不能为空。';
  }

  if (!input.actualValue?.trim()) {
    return '实测值不能为空。';
  }

  if (!input.result) {
    return '试验结果不能为空。';
  }

  if (!input.conclusion?.trim()) {
    return '试验结论不能为空。';
  }

  if (!input.testedById) {
    return '试验人不能为空。';
  }

  if (!input.testedAt) {
    return '试验时间不能为空。';
  }

  if (!input.reportAttachmentId) {
    return '请先上传试验报告附件。';
  }

  return null;
}

export function canEditPerformanceTest(status: PerformanceTestStatus) {
  return status === PerformanceTestStatus.DRAFT;
}
