'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CabinReviewWorkspace } from './cabin-review-workspace';
import { ConsistencyReviewWorkspace } from './consistency-review-workspace';
import { MonthlyReviewWorkspace } from './monthly-review-workspace';

type ProjectReviewsWorkspaceProps = {
  projectId: string;
};

export function ProjectReviewsWorkspace({
  projectId,
}: ProjectReviewsWorkspaceProps) {
  const search = useSearchParams();
  const initial = search?.get('review');
  const [selected, setSelected] = useState(initial === 'consistency' || initial === 'legacy-monthly' ? initial : 'cabin');
  const [opened, setOpened] = useState(() => new Set([selected]));
  return (
    <div className="page-stack">
      <nav className="m1-button-group" aria-label="评审类别">
        {([['cabin', '驾驶室评审'], ['consistency', '一致性评审'], ['legacy-monthly', '历史月度评审']] as const).map(([value, label]) => <button key={value} className={`m1-button ${selected === value ? 'm1-primary' : ''}`} aria-pressed={selected === value} onClick={() => { setOpened(previous => new Set([...previous, value])); setSelected(value); }}>{label}</button>)}
      </nav>
      {opened.has('cabin') ? <div hidden={selected !== 'cabin'}><CabinReviewWorkspace projectId={projectId} /></div> : null}
      {opened.has('consistency') ? <div hidden={selected !== 'consistency'}><ConsistencyReviewWorkspace projectId={projectId} /></div> : null}
      {opened.has('legacy-monthly') ? <div hidden={selected !== 'legacy-monthly'}><MonthlyReviewWorkspace projectId={projectId} /></div> : null}
    </div>
  );
}
