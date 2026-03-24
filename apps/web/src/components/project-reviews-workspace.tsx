'use client';

import React from 'react';
import { CabinReviewWorkspace } from './cabin-review-workspace';
import { ConsistencyReviewWorkspace } from './consistency-review-workspace';

type ProjectReviewsWorkspaceProps = {
  projectId: string;
};

export function ProjectReviewsWorkspace({
  projectId,
}: ProjectReviewsWorkspaceProps) {
  return (
    <div className="page-stack">
      <CabinReviewWorkspace projectId={projectId} />
      <ConsistencyReviewWorkspace projectId={projectId} />
    </div>
  );
}
