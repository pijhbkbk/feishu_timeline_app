import { ProjectWorkflowWorkspace } from '../../../../components/project-workflow-workspace';

type ProjectTasksPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectTasksPage({ params }: ProjectTasksPageProps) {
  const { projectId } = await params;

  return <ProjectWorkflowWorkspace projectId={projectId} mode="tasks" />;
}
