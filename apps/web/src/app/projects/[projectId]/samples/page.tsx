import { SamplesWorkspace } from '../../../../components/samples-workspace';

type SamplesPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function SamplesPage({ params }: SamplesPageProps) {
  const { projectId } = await params;

  return <SamplesWorkspace projectId={projectId} />;
}
