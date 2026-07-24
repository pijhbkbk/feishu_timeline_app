import { ProjectWorkspaceR22 } from '../../../../components/project-workspace-r22';

type PageProps = { params: Promise<{ projectId: string }> };

export default async function Page({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectWorkspaceR22 projectId={projectId} />;
}
