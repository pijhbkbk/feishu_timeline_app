import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const appShellSource = readFileSync(new URL('./app-shell.tsx', import.meta.url), 'utf8');
const projectsSource = readFileSync(
  new URL('./projects-list-client.tsx', import.meta.url),
  'utf8',
);
const v2ShellSource = readFileSync(
  new URL('../features/v2/v2-shell.tsx', import.meta.url),
  'utf8',
);
const v2ProjectsSource = readFileSync(
  new URL('../features/v2/projects-page.tsx', import.meta.url),
  'utf8',
);
const readOnlyDataHookSource = readFileSync(
  new URL('../features/v2/use-r26-readonly-data.ts', import.meta.url),
  'utf8',
);

describe('project search and shared header cleanup contract', () => {
  it('keeps the real project-page search without a duplicate global header action', () => {
    expect(appShellSource).not.toContain("window.dispatchEvent(new CustomEvent('r22:focus-project-search'))");
    expect(appShellSource).not.toContain('aria-label="搜索项目"');
    expect(appShellSource).not.toContain('NotificationBell');
    expect(appShellSource).not.toContain('href="/guide"');
    expect(projectsSource).toContain("window.addEventListener('r22:focus-project-search'");
    expect(projectsSource).toContain("get('focus') === 'search'");
    expect(projectsSource).toContain('keywordInputRef.current.focus({ preventScroll: true })');
    expect(projectsSource).toContain('data-testid="project-search-input"');
    expect(projectsSource).toContain('role="search"');
  });

  it('removes search, notification, and help actions from the V2 header', () => {
    expect(v2ShellSource).not.toContain("window.dispatchEvent(new CustomEvent('r22:focus-project-search'))");
    expect(v2ShellSource).not.toContain('projectSearchHref');
    expect(v2ShellSource).not.toContain('href="/guide"');
    expect(v2ShellSource).not.toContain('aria-label="搜索项目"');
    expect(v2ShellSource).not.toContain('NotificationBell');
    expect(v2ShellSource).not.toContain('SearchIcon');
    expect(v2ShellSource).not.toContain('BellIcon');
    expect(v2ShellSource).not.toContain('HelpIcon');
  });

  it('connects the formal V2 project search to the server keyword query', () => {
    expect(v2ProjectsSource).toContain("window.addEventListener('r22:focus-project-search'");
    expect(v2ProjectsSource).toContain('&keyword=${encodeURIComponent(projectSearch.keyword)}');
    expect(v2ProjectsSource).toContain('data-testid="r26-project-search-input"');
    expect(v2ProjectsSource).toContain('role="search"');
    expect(v2ProjectsSource).toContain('项目名称、项目编号、颜色名称或第 05 步确认的颜色编号');
  });

  it('prevents a cancelled stale request from replacing a successful keyword query', () => {
    expect(readOnlyDataHookSource).toContain('let isActiveRequest = true');
    expect(readOnlyDataHookSource).toContain('if (!isActiveRequest)');
    expect(readOnlyDataHookSource).toContain('isActiveRequest = false');
  });
});
