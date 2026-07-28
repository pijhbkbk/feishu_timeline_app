import { AdminColorArchiveR26 } from '../../../../components/admin-color-archive-r26';

export default async function AdminColorArchivePage({ params }: { params: Promise<{ colorId: string }> }) {
  const { colorId } = await params;
  return <AdminColorArchiveR26 colorId={colorId} />;
}
