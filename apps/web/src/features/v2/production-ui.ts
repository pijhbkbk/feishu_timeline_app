import type { R26Viewer } from './real-types';

const FORMAL_V2_PATHS = [
  /^\/dashboard$/,
  /^\/projects$/,
  /^\/projects\/[^/]+$/,
  /^\/projects\/[^/]+\/actions\/[^/]+$/,
  /^\/projects\/[^/]+\/retrospective$/,
  /^\/tasks$/,
  /^\/progress$/,
  /^\/materials$/,
  /^\/admin$/,
  /^\/admin\/audit-logs$/,
];

export function isProductionV2Ui(
  value = process.env.NEXT_PUBLIC_UI_VERSION,
) {
  return value === 'v2';
}

export function isFormalV2Path(pathname: string) {
  return FORMAL_V2_PATHS.some((pattern) => pattern.test(pathname));
}

export function toProductHref(
  v2Href: string,
  uiVersion = process.env.NEXT_PUBLIC_UI_VERSION,
) {
  if (!isProductionV2Ui(uiVersion)) {
    return v2Href;
  }

  return v2Href.replace(/^\/v2(?=\/|$)/, '') || '/dashboard';
}

export function canCreateR26Project(
  viewer: Pick<R26Viewer, 'isSystemAdmin' | 'roleCodes'> | null | undefined,
) {
  return Boolean(
    viewer &&
      (viewer.isSystemAdmin ||
        viewer.roleCodes.includes('admin') ||
        viewer.roleCodes.includes('project_manager')),
  );
}
