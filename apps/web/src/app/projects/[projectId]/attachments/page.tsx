import { AttachmentsWorkspace } from '../../../../components/attachments-workspace';

type AttachmentsPageProps = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    entityType?: string;
    entityId?: string;
    includeDeleted?: string;
  }>;
};

export default async function AttachmentsPage({
  params,
  searchParams,
}: AttachmentsPageProps) {
  const { projectId } = await params;
  const filters = await searchParams;

  return (
    <AttachmentsWorkspace
      projectId={projectId}
      initialFilters={{
        entityType: (filters.entityType as
          | 'PROJECT'
          | 'SAMPLE'
          | 'STANDARD_BOARD'
          | 'PERFORMANCE_TEST'
          | 'REVIEW_RECORD'
          | 'NEW_COLOR_REPORT'
          | 'TRIAL_PRODUCTION'
          | '') ?? '',
        entityId: filters.entityId ?? '',
        includeDeleted: filters.includeDeleted === 'true',
      }}
    />
  );
}
