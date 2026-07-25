export type R26BusinessRecordAction = {
  href: string;
  label: string;
  guidance: string;
};

export function getR26BusinessRecordAction(
  nodeCode: string,
  projectId: string,
): R26BusinessRecordAction | null {
  if (nodeCode !== 'FIRST_UNIT_PRODUCTION_PLAN') {
    return null;
  }

  return {
    href: `/projects/${encodeURIComponent(projectId)}/pilot-production`,
    label: '新建并确认首台生产计划',
    guidance:
      '先新建首台生产计划，再在计划列表中点击“确认”。完成后返回项目工作区重新检查。',
  };
}
