import { Suspense } from 'react';

import { ProgressWorkspaceR22 } from '../../components/progress-workspace-r22';

export default function ProgressPage() {
  return (
    <Suspense fallback={<section className="r22-card r22-state-card"><h1>正在打开进展提交…</h1></section>}>
      <ProgressWorkspaceR22 />
    </Suspense>
  );
}
