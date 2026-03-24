import { SampleDetailClient } from '../../../../../components/sample-detail-client';

type SampleDetailPageProps = {
  params: Promise<{
    projectId: string;
    sampleId: string;
  }>;
};

export default async function SampleDetailPage({ params }: SampleDetailPageProps) {
  const { projectId, sampleId } = await params;

  return <SampleDetailClient projectId={projectId} sampleId={sampleId} />;
}
