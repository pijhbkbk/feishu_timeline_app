import { ProjectReviewsWorkspace } from '../../../../components/project-reviews-workspace';

type ReviewsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ReviewsPage({ params }: ReviewsPageProps) {
  const { projectId } = await params;

  return <ProjectReviewsWorkspace projectId={projectId} />;
}
