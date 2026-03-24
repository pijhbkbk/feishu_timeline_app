import { DevelopmentReportWorkspace } from '../../../../components/development-report-workspace';

type DevelopmentReportPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function DevelopmentReportPage({
  params,
}: DevelopmentReportPageProps) {
  const { projectId } = await params;

  return <DevelopmentReportWorkspace projectId={projectId} />;
}
