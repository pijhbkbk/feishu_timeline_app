import React from 'react';
import { VisualDeltaReviewWorkspace } from '../../../../components/visual-delta-review-workspace';

type Props = { params: Promise<{ projectId: string }>; searchParams: Promise<{ recurringTaskId?: string }> };
export default async function ColorEvaluationPage({ params, searchParams }: Props) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  return <VisualDeltaReviewWorkspace key={`${projectId}:${query.recurringTaskId ?? ''}`} projectId={projectId} recurringTaskId={query.recurringTaskId ?? ''} />;
}
