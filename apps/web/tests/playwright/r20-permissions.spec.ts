import { expect, test } from '@playwright/test';

import {
  createR20ProjectByApi,
  fetchR20ApiStatus,
  loginAsR20Role,
  logoutR20,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 已认证用户全权限实操 @r20', () => {
  test('R20-011 verifies full access for authenticated users and keeps anonymous access blocked @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const managerProject = await createR20ProjectByApi(request, 'permissionMaterial');

    await loginAsR20Role(page, 'finance');
    const financeAdminStatus = await fetchR20ApiStatus(request, '/users/roles');
    expect(financeAdminStatus.status).toBe(200);
    const financeProject = await createR20ProjectByApi(request, 'rework');

    await loginAsR20Role(page, 'viewer');
    await page.goto('/projects/new');
    await expect(page.getByTestId('project-submit-button')).toBeEnabled();
    await expect(page.getByText('当前角色无权访问该功能。')).toHaveCount(0);
    await saveR20Screenshot(page, testInfo, 'authenticated-full-access.png');

    const viewerProject = await createR20ProjectByApi(request, 'nonBlocking');
    const crossProjectRead = await fetchR20ApiStatus(request, `/projects/${managerProject.id}`);
    expect(crossProjectRead.status).toBe(200);

    await logoutR20(page);
    await page.goto('/dashboard');
    await expect(page.getByText('请先登录')).toBeVisible();
    await expect(page.getByRole('link', { name: '前往登录' })).toBeVisible();
    const unauthProjects = await fetchR20ApiStatus(request, '/projects');
    expect(unauthProjects.status).toBe(401);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-011',
      scenario: '已认证用户全权限与未登录访问边界',
      role: '财务部 / 普通查看者 / 未登录用户',
      projects: [managerProject, financeProject, viewerProject],
      financeAdminStatus: financeAdminStatus.status,
      crossProjectReadStatus: crossProjectRead.status,
      unauthProjectsStatus: unauthProjects.status,
      result: 'PASS',
    });
  });
});
