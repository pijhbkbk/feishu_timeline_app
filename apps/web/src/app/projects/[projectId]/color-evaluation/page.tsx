import { VisualDeltaReviewWorkspace } from '../../../../components/visual-delta-review-workspace';

type ColorEvaluationPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ColorEvaluationPage({
  params,
}: ColorEvaluationPageProps) {
  const { projectId } = await params;

  return <VisualDeltaReviewWorkspace projectId={projectId} />;
}
