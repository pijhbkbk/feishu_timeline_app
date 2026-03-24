import { ProjectLogsWorkspace } from '../../../../components/project-logs-workspace';

type ProjectLogsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectLogsPage({ params }: ProjectLogsPageProps) {
  const { projectId } = await params;

  return <ProjectLogsWorkspace projectId={projectId} />;
}
