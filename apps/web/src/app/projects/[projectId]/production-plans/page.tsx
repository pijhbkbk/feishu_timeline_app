import { SchedulePlansWorkspace } from '../../../../components/schedule-plans-workspace';

type ProductionPlansPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProductionPlansPage({
  params,
}: ProductionPlansPageProps) {
  const { projectId } = await params;

  return <SchedulePlansWorkspace projectId={projectId} />;
}
