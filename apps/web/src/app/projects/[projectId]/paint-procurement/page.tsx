import { PaintProcurementWorkspace } from '../../../../components/paint-procurement-workspace';

type PaintProcurementPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function PaintProcurementPage({
  params,
}: PaintProcurementPageProps) {
  const { projectId } = await params;

  return <PaintProcurementWorkspace projectId={projectId} />;
}
