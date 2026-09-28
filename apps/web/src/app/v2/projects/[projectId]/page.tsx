import { Suspense } from 'react';
import { RealWorkspacePage } from '../../../../features/v2/real-workspace-page';
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Suspense fallback={<p role="status">正在加载项目…</p>}><RealWorkspacePage key={projectId} projectId={projectId} /></Suspense>;
}
