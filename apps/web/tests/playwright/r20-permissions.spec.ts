import { expect, test } from '@playwright/test';

import {
  createR20ProjectByApi,
  fetchR20ApiStatus,
  loginAsR20Role,
  logoutR20,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R24 前方案 A 最小权限实操 @r20', () => {
  test('R20-011 verifies least privilege for authenticated roles and blocks anonymous access @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const managerProject = await createR20ProjectByApi(request, 'permissionMaterial');
    const managerRoleAdminStatus = await fetchR20ApiStatus(request, '/users/roles');
    expect(managerRoleAdminStatus.status).toBe(403);

    await loginAsR20Role(page, 'finance');
    const financeAdminStatus = await fetchR20ApiStatus(request, '/users/roles');
    const financeProjectCreate = await fetchR20ApiStatus(request, '/projects', {
      method: 'POST',
      data: {},
    });
    expect(financeAdminStatus.status).toBe(403);
    expect(financeProjectCreate.status).toBe(403);

    await loginAsR20Role(page, 'viewer');
    await page.goto('/projects/new');
    await expect(page.getByTestId('project-submit-button')).toBeDisabled();
    await expect(
      page.getByText('只有项目经理或管理员可创建项目、调整负责人和维护项目成员。'),
    ).toBeVisible();
    await saveR20Screenshot(page, testInfo, 'minimum-permission-viewer.png');
    const viewerProjectCreate = await fetchR20ApiStatus(request, '/projects', {
      method: 'POST',
      data: {},
    });
    const viewerAuditRead = await fetchR20ApiStatus(
      request,
      `/projects/${managerProject.id}/logs`,
    );
    expect(viewerProjectCreate.status).toBe(403);
    expect(viewerAuditRead.status).toBe(403);

    await loginAsR20Role(page, 'admin');
    const adminRolesStatus = await fetchR20ApiStatus(request, '/users/roles');
    const adminAuditRead = await fetchR20ApiStatus(
      request,
      `/projects/${managerProject.id}/logs`,
    );
    expect(adminRolesStatus.status).toBe(200);
    expect(adminAuditRead.status).toBe(200);

    await loginAsR20Role(page, 'auditor');
    const auditorAuditRead = await fetchR20ApiStatus(
      request,
      `/projects/${managerProject.id}/logs`,
    );
    const auditorProjectCreate = await fetchR20ApiStatus(request, '/projects', {
      method: 'POST',
      data: {},
    });
    expect(auditorAuditRead.status).toBe(200);
    expect(auditorProjectCreate.status).toBe(403);

    await logoutR20(page);
    await page.goto('/dashboard');
    await expect(page.getByText('请先登录')).toBeVisible();
    await expect(page.getByRole('link', { name: '前往登录' })).toBeVisible();
    const unauthProjects = await fetchR20ApiStatus(request, '/projects');
    expect(unauthProjects.status).toBe(401);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-011',
      scenario: '方案 A 最小权限与未登录访问边界',
      role: '项目经理 / 财务 / 普通查看者 / 管理员 / 审计人员 / 未登录用户',
      projects: [managerProject],
      managerRoleAdminStatus: managerRoleAdminStatus.status,
      financeAdminStatus: financeAdminStatus.status,
      financeProjectCreateStatus: financeProjectCreate.status,
      viewerProjectCreateStatus: viewerProjectCreate.status,
      viewerAuditReadStatus: viewerAuditRead.status,
      adminRolesStatus: adminRolesStatus.status,
      adminAuditReadStatus: adminAuditRead.status,
      auditorAuditReadStatus: auditorAuditRead.status,
      auditorProjectCreateStatus: auditorProjectCreate.status,
      unauthProjectsStatus: unauthProjects.status,
      result: 'PASS',
    });
  });
});
