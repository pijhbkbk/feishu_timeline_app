import { ProjectWorkflowWorkspace } from '../../../../components/project-workflow-workspace';

type ProjectWorkflowPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectWorkflowPage({ params }: ProjectWorkflowPageProps) {
  const { projectId } = await params;

  return <ProjectWorkflowWorkspace projectId={projectId} mode="workflow" />;
}
