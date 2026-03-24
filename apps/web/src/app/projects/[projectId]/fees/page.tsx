import { FeesWorkspace } from '../../../../components/fees-workspace';

type FeesPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function FeesPage({ params }: FeesPageProps) {
  const { projectId } = await params;

  return <FeesWorkspace projectId={projectId} />;
}
