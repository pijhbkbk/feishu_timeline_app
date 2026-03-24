import { ProjectOverviewClient } from '../../../../components/project-overview-client';

type ProjectOverviewPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectOverviewPage({ params }: ProjectOverviewPageProps) {
  const { projectId } = await params;

  return <ProjectOverviewClient projectId={projectId} />;
}
