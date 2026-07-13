import { ProjectWorkspaceR22 } from '../../../components/project-workspace-r22';

type ProjectIndexPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectIndexPage({ params }: ProjectIndexPageProps) {
  const { projectId } = await params;

  return <ProjectWorkspaceR22 projectId={projectId} />;
}
