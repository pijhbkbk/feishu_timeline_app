import { Suspense } from 'react';
import { ColorProjectOverview } from '../../../features/color-projects/project-overview';
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Suspense fallback={<p role="status">正在加载项目…</p>}><ColorProjectOverview key={projectId} projectId={projectId} /></Suspense>;
}
