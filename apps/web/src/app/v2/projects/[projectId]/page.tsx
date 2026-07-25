import { Suspense } from 'react';

import { WorkspacePage } from '../../../../features/v2/workspace-page';

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <Suspense fallback={<div className="r26-page"><div className="r26-static-loading">正在准备流程地图…</div></div>}>
      <WorkspacePage projectId={projectId} />
    </Suspense>
  );
}
