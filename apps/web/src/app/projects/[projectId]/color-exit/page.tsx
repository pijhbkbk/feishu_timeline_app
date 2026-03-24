import { ColorExitWorkspace } from '../../../../components/color-exit-workspace';

type ColorExitPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ColorExitPage({ params }: ColorExitPageProps) {
  const { projectId } = await params;

  return <ColorExitWorkspace projectId={projectId} />;
}
