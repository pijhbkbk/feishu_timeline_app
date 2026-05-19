import { FlowMapWorkspace } from '../../../../components/flow-map-workspace';

type ProjectFlowMapPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectFlowMapPage({ params }: ProjectFlowMapPageProps) {
  const { projectId } = await params;

  return <FlowMapWorkspace projectId={projectId} />;
}
