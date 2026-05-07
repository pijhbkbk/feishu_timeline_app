import { AttachmentsWorkspace } from '../../../../components/attachments-workspace';

type ProjectMaterialsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectMaterialsPage({ params }: ProjectMaterialsPageProps) {
  const { projectId } = await params;

  return <AttachmentsWorkspace projectId={projectId} mode="materials" />;
}
