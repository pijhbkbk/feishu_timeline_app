'use client';
import React, { useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { PersonSheetWorkspace } from '../person-sheet/person-workspace';
import { PeopleDirectory } from './people-directory';
export function PeopleEntry() {
  const [sheet, setSheet] = useState(false);
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">正在加载账号…</p>;
  if (!user?.isSystemAdmin && !user?.teamAccessApproved) return <p role="alert">当前账号尚未获准访问人员库。</p>;
  return sheet ? <><button className="m1-button people-sheet-switch" onClick={() => setSheet(false)}>返回人员列表</button><PersonSheetWorkspace /></> : <PeopleDirectory onSheet={() => setSheet(true)} />;
}
