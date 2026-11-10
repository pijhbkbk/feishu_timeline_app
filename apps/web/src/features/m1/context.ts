// Only these source contexts can produce a return route. No arbitrary return URL.
export function nodeReturnHref(projectId: string, taskId: string, search: string) {
  const q = new URLSearchParams(search);
  const from = q.getAll('from');
  const node = encodeURIComponent(taskId);
  const extra = new URLSearchParams();
  for (const name of ['listKeyword','listStage','listPage']) { const v=q.get(name); if(v && v.length<=100) extra.set(name,v); }
  if (extra.size) extra.set('from','list');
  if (from.length === 1 && from[0] === 'dashboard') return `/dashboard?project=${encodeURIComponent(projectId)}&taskId=${node}`;
  if (from.length === 1 && from[0] === 'project') {
    const tab = ['flow', 'materials', 'records', 'tracking'].includes(q.get('tab') ?? '') ? q.get('tab')! : 'flow';
    return `/projects/${encodeURIComponent(projectId)}?tab=${tab}&taskId=${node}${extra.size ? `&${extra}` : ''}`;
  }
  return `/projects/${encodeURIComponent(projectId)}`;
}
export function taskHref(projectId: string, taskId: string, source: 'dashboard' | 'project', search = '') {
  const q=new URLSearchParams({from:source,tab:'flow'});
  if (source==='project') { const current=new URLSearchParams(search); const tab=current.get('tab'); if(tab && ['flow','materials','records','tracking'].includes(tab))q.set('tab',tab); for(const name of ['listKeyword','listStage','listPage']) {const value=current.get(name);if(value && value.length<=100)q.set(name,value);} }
  return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}?${q}`;
}

// Record pages carry a task identity and a small source context, never a return URL.
function recordContext(search: string) {
  const input = new URLSearchParams(search), result = new URLSearchParams();
  const sources = input.getAll('from');
  if (sources.length === 1 && ['dashboard', 'project'].includes(sources[0]!)) result.set('from', sources[0]!);
  const tab = input.get('tab');
  if (tab && ['flow', 'materials', 'records', 'tracking'].includes(tab)) result.set('tab', tab);
  for (const name of ['listKeyword', 'listStage', 'listPage']) {
    const values = input.getAll(name);
    if (values.length === 1 && values[0] && values[0].length <= 100) result.set(name, values[0]);
  }
  return result;
}

export function recordEntryHref(href: string, taskId: string, search: string) {
  // The caller supplies a known project record route. Reject protocol/path escapes.
  if (!/^\/projects\/[^/?#]+\/[a-z-]+$/.test(href)) throw new Error('Invalid project record route');
  const context = recordContext(search);
  context.set('originTask', taskId);
  return `${href}?${context}`;
}

export function recordReturnHref(projectId: string, search: string, fallbackTab = 'flow') {
  const input = new URLSearchParams(search), tasks = input.getAll('originTask');
  if (tasks.length === 1 && /^[a-zA-Z0-9_-]{1,128}$/.test(tasks[0]!)) {
    const context = recordContext(search);
    return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(tasks[0]!)}${context.size ? `?${context}` : ''}`;
  }
  const tab = ['flow', 'materials', 'records', 'tracking'].includes(fallbackTab) ? fallbackTab : 'flow';
  return `/projects/${encodeURIComponent(projectId)}?tab=${tab}`;
}

export function carryRecordContext(href: string, search: string) {
  if (!href.startsWith('/projects/') || href.includes('#')) return href;
  const input = new URLSearchParams(search), tasks = input.getAll('originTask');
  if (tasks.length !== 1 || !/^[a-zA-Z0-9_-]{1,128}$/.test(tasks[0]!)) return href;
  const [path, existing] = href.split('?'), query = new URLSearchParams(existing);
  for (const [key, value] of recordContext(search)) query.set(key, value);
  query.set('originTask', tasks[0]!);
  return `${path}?${query}`;
}
