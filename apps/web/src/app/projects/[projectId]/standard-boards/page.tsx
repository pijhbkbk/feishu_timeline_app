import { StandardBoardsWorkspace } from '../../../../components/standard-boards-workspace';

type StandardBoardsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function StandardBoardsPage({
  params,
}: StandardBoardsPageProps) {
  const { projectId } = await params;

  return <StandardBoardsWorkspace projectId={projectId} />;
}
