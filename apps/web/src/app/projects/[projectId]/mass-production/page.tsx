import { MassProductionWorkspace } from '../../../../components/mass-production-workspace';

type MassProductionPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function MassProductionPage({
  params,
}: MassProductionPageProps) {
  const { projectId } = await params;

  return <MassProductionWorkspace projectId={projectId} />;
}
