import { ProjectRetrospectiveR22 } from '../../../../../components/project-retrospective-r22';

type PageProps = { params: Promise<{ projectId: string }> };

export default async function Page({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectRetrospectiveR22 projectId={projectId} />;
}
