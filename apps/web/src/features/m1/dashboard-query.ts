export function dashboardProjectQuery(keyword: string) {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (keyword.trim()) params.set('keyword', keyword.trim().slice(0, 100));
  return `/projects?${params}`;
}
