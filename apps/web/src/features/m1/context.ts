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
  if (source==='project') { const current=new URLSearchParams(search); for(const name of ['listKeyword','listStage','listPage']) {const value=current.get(name);if(value && value.length<=100)q.set(name,value);} }
  return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}?${q}`;
}
