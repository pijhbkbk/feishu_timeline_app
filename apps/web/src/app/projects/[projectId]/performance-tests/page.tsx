import { PerformanceTestsWorkspace } from '../../../../components/performance-tests-workspace';

type PerformanceTestsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function PerformanceTestsPage({
  params,
}: PerformanceTestsPageProps) {
  const { projectId } = await params;

  return <PerformanceTestsWorkspace projectId={projectId} />;
}
