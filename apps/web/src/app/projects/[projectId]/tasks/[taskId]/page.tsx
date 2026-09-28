import React from 'react';
import { TaskWorkspace } from '../../../../../features/team-work/task-workspace';
export default async function Page({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  return <TaskWorkspace key={`${projectId}:${taskId}`} projectId={projectId} taskId={taskId} />;
}
