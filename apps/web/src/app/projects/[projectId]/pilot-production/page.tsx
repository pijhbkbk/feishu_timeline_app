import { PilotProductionWorkspace } from '../../../../components/pilot-production-workspace';

type PilotProductionPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function PilotProductionPage({
  params,
}: PilotProductionPageProps) {
  const { projectId } = await params;

  return <PilotProductionWorkspace projectId={projectId} />;
}
