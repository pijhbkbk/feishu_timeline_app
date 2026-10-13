'use client';
import React from 'react';
import { useAuth } from '../../components/auth-provider';
import { PersonSheetWorkspace } from '../person-sheet/person-workspace';
export function PeopleEntry() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">正在加载账号…</p>;
  if (!user?.isSystemAdmin && !user?.teamAccessApproved) return <p role="alert">当前账号尚未获准访问人员库。</p>;
  return <PersonSheetWorkspace />;
}
