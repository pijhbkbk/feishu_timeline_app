export type R26LifecycleAction = {
  slug:
    | 'cabin-review'
    | 'development-fee'
    | 'consistency-review'
    | 'production-plan'
    | 'mass-production'
    | 'monthly-review'
    | 'color-exit';
  stepNumber: number;
  title: string;
  eyebrow: string;
  description: string;
  primaryActionLabel: string;
};

const LIFECYCLE_ACTIONS: R26LifecycleAction[] = [
  {
    slug: 'cabin-review',
    stepNumber: 12,
    title: '样车驾驶室评审',
    eyebrow: 'Gate 3C2 · 评审与退回',
    description:
      '提交评审结论并由服务端决定通过或退回；退回时保留原因、整改要求、轮次与完整审计历史。',
    primaryActionLabel: '办理驾驶室评审',
  },
  {
    slug: 'development-fee',
    stepNumber: 13,
    title: '颜色开发收费',
    eyebrow: 'Gate 3C2 · 非阻塞收费',
    description:
      '记录固定收费、记账与支付状态。收费是并行非阻塞节点，不改变项目主线裁决。',
    primaryActionLabel: '办理颜色开发收费',
  },
  {
    slug: 'consistency-review',
    stepNumber: 14,
    title: '颜色一致性评审',
    eyebrow: 'Gate 3C2 · 一致性门禁',
    description:
      '通过后进入排产；驳回时由后端退回涂料开发，并保留历史评审记录。',
    primaryActionLabel: '办理一致性评审',
  },
  {
    slug: 'production-plan',
    stepNumber: 15,
    title: '排产计划',
    eyebrow: 'Gate 3C2 · 排产确认',
    description:
      '创建并确认有效排产计划，满足门禁后由服务端推进至批量生产。',
    primaryActionLabel: '办理排产计划',
  },
  {
    slug: 'mass-production',
    stepNumber: 16,
    title: '批量生产',
    eyebrow: 'Gate 3C2 · 生产记录',
    description:
      '登记、开始并完成生产记录；至少一条生产记录完成后方可推进至月度评审。',
    primaryActionLabel: '办理批量生产',
  },
  {
    slug: 'monthly-review',
    stepNumber: 17,
    title: '12 个月整车色差一致性评审',
    eyebrow: 'Gate 3C3 · 月度治理',
    description:
      '每月记录独立保存，只有 12/12 全部完成后才由服务端激活颜色退出。',
    primaryActionLabel: '办理本月评审',
  },
  {
    slug: 'color-exit',
    stepNumber: 18,
    title: '颜色退出',
    eyebrow: 'Gate 3C3 · 人工最终决定',
    description:
      '系统建议仅供参考；授权人员必须提交明确的人工决定后，项目与颜色主数据才会收尾。',
    primaryActionLabel: '办理颜色退出',
  },
];

export function getR26LifecycleActionByStep(stepNumber: number) {
  return (
    LIFECYCLE_ACTIONS.find((action) => action.stepNumber === stepNumber) ??
    null
  );
}

export function getR26LifecycleActionBySlug(slug: string) {
  return LIFECYCLE_ACTIONS.find((action) => action.slug === slug) ?? null;
}

export function getR26LifecycleActionHref(
  projectId: string,
  stepNumber: number,
) {
  const action = getR26LifecycleActionByStep(stepNumber);
  return action
    ? `/v2/projects/${encodeURIComponent(projectId)}/actions/${action.slug}`
    : null;
}

export const R26_LIFECYCLE_ACTIONS = LIFECYCLE_ACTIONS;
