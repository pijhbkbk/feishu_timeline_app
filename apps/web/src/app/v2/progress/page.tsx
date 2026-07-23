import { Suspense } from 'react';

import { ProgressPage } from '../../../features/v2/progress-page';

export default function Page() {
  return (
    <Suspense fallback={<div className="r26-page"><div className="r26-static-loading">正在准备进展表单…</div></div>}>
      <ProgressPage />
    </Suspense>
  );
}
