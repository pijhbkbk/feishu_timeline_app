import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CabinReviewWorkspace } from '../../../../../../components/cabin-review-workspace';
import { ColorExitWorkspace } from '../../../../../../components/color-exit-workspace';
import { ConsistencyReviewWorkspace } from '../../../../../../components/consistency-review-workspace';
import { FeesWorkspace } from '../../../../../../components/fees-workspace';
import { MassProductionWorkspace } from '../../../../../../components/mass-production-workspace';
import { SchedulePlansWorkspace } from '../../../../../../components/schedule-plans-workspace';
import { VisualDeltaReviewWorkspace } from '../../../../../../components/visual-delta-review-workspace';
import {
  getR26LifecycleActionBySlug,
  type R26LifecycleAction,
} from '../../../../../../features/v2/lifecycle-actions';

type R26LifecycleActionPageProps = {
  params: Promise<{
    projectId: string;
    action: string;
  }>;
};

export default async function R26LifecycleActionPage({
  params,
}: R26LifecycleActionPageProps) {
  const { projectId, action: actionSlug } = await params;
  const action = getR26LifecycleActionBySlug(actionSlug);

  if (!action) {
    notFound();
  }

  return (
    <main className="r26-lifecycle-workspace">
      <section className="r26-lifecycle-workspace__header">
        <div>
          <span>{action.eyebrow}</span>
          <h1>
            第 {String(action.stepNumber).padStart(2, '0')} 步 · {action.title}
          </h1>
          <p>{action.description}</p>
        </div>
        <Link
          className="r26-button r26-button--secondary"
          href={`/v2/projects/${encodeURIComponent(projectId)}?nodeCode=${encodeURIComponent(
            nodeCodeForAction(action),
          )}`}
        >
          返回流程地图
        </Link>
      </section>

      <section className="r26-lifecycle-workspace__guardrail">
        <strong>业务裁决由后端完成</strong>
        <span>
          页面只提交表单与动作；下一节点、退回目标、月度完成数和最终收尾状态均不能由前端指定。
        </span>
      </section>

      <div className="r26-lifecycle-workspace__content">
        <LifecycleWorkspace action={action} projectId={projectId} />
      </div>
    </main>
  );
}

function LifecycleWorkspace({
  action,
  projectId,
}: {
  action: R26LifecycleAction;
  projectId: string;
}) {
  switch (action.slug) {
    case 'cabin-review':
      return <CabinReviewWorkspace projectId={projectId} />;
    case 'development-fee':
      return <FeesWorkspace projectId={projectId} />;
    case 'consistency-review':
      return <ConsistencyReviewWorkspace projectId={projectId} />;
    case 'production-plan':
      return <SchedulePlansWorkspace projectId={projectId} />;
    case 'mass-production':
      return <MassProductionWorkspace projectId={projectId} />;
    case 'monthly-review':
      return <VisualDeltaReviewWorkspace projectId={projectId} />;
    case 'color-exit':
      return <ColorExitWorkspace projectId={projectId} />;
  }
}

function nodeCodeForAction(action: R26LifecycleAction) {
  const nodeCodes: Record<R26LifecycleAction['slug'], string> = {
    'cabin-review': 'CAB_REVIEW',
    'development-fee': 'DEVELOPMENT_ACCEPTANCE',
    'consistency-review': 'COLOR_CONSISTENCY_REVIEW',
    'production-plan': 'MASS_PRODUCTION_PLAN',
    'mass-production': 'MASS_PRODUCTION',
    'monthly-review': 'VISUAL_COLOR_DIFFERENCE_REVIEW',
    'color-exit': 'PROJECT_CLOSED',
  };
  return nodeCodes[action.slug];
}
