import type { SessionUser } from './auth-client';

export function needsAssignment(user: SessionUser) {
  return user.authSource === 'local' && !user.isSystemAdmin && user.roleCodes.length === 0;
}

export function defaultHome(user: SessionUser) {
  return needsAssignment(user) ? '/pending-access' : '/dashboard';
}

export function loginHref(pathname: string, search = '') {
  if (['/', '/dashboard', '/v2/dashboard', '/login', '/pending-access'].includes(pathname)) return '/login';
  return `/login?returnTo=${encodeURIComponent(pathname + search)}`;
}

// Navigation is not authorization: destination APIs continue to enforce their
// role, permission and project scope; project deep links are probed below.
export async function resolveLoginDestination(
  user: SessionUser, search: string, origin: string,
  canReadProject: (id: string) => Promise<boolean>,
) {
  const fallback = defaultHome(user);
  const values = new URLSearchParams(search).getAll('returnTo');
  if (values.length !== 1 || !values[0] || values[0].length > 2048) return fallback;
  const input = values[0];
  if ((input.includes('\\') || Array.from(input).some(char => char.codePointAt(0)! <= 32 || char.codePointAt(0) === 127)) || /%(?:2f|5c|00|0a|0d|25)/i.test(input)) return fallback;
  let url: URL;
  try { url = new URL(input, origin); } catch { return fallback; }
  if (url.origin !== origin || url.username || url.password || input.startsWith('//')) return fallback;
  const path = url.pathname.replace(/^\/v2(?=\/|$)/, '').replace(/\/$/, '') || '/';
  const destination = path + url.search + url.hash;
  if (path === '/account' || path === '/account/security') return destination;
  if (needsAssignment(user)) return fallback;
  if (['/dashboard', '/projects', '/tasks'].includes(path)) return destination;
  const administrator = user.roleCodes.includes('admin') &&
    (user.isSystemAdmin || user.permissionCodes?.includes('system.manage'));
  if (path === '/admin/accounts' || path === '/admin/people') return administrator && user.isSystemAdmin ? destination : fallback;
  if (['/admin', '/admin/projects', '/admin/tasks', '/admin/organization', '/admin/assignments', '/admin/permissions', '/admin/audit-logs'].includes(path)) return administrator ? destination : fallback;
  if (path === '/projects/new') return user.roleCodes.some(role => ['admin', 'project_manager'].includes(role)) &&
    (user.isSystemAdmin || user.permissionCodes?.includes('project.write')) ? destination : fallback;
  const project = /^\/projects\/([A-Za-z0-9_-]+)$/.exec(path);
  if (project) {
    try { if (await canReadProject(project[1]!)) return destination; } catch { /* fail closed */ }
  }
  return fallback;
}
