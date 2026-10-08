import React, { Suspense } from 'react';
import { M1NodeWorkspace } from '../../../../../features/m1/node-workspace';
export default async function Page({ params }: { params: Promise<{ projectId: string; taskId: string }> }) { const {projectId,taskId}=await params; return <Suspense fallback={<p role="status">正在加载节点…</p>}><M1NodeWorkspace key={`${projectId}:${taskId}`} projectId={projectId} taskId={taskId}/></Suspense>; }
