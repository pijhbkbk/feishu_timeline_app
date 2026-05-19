import { expect, test } from '@playwright/test';

import { apiJson } from './helpers';
import {
  advanceR20ToCabReview,
  advanceR20ToStep4Branches,
  createR20ProjectByApi,
  fetchR20ApiStatus,
  loginAsR20Role,
  logoutR20,
  saveR20Screenshot,
  writeR20CaseRecord,
} from './r20-fixtures';
import { fetchR16Workflow, transitionR16Task } from './r16-fixtures';

test.describe('R20 权限与越权实操 @r20', () => {
  test('R20-011 verifies role boundaries, unauthenticated access and IDOR smoke checks @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;

    const procurementProject = await createR20ProjectByApi(request, 'permissionMaterial');
    await advanceR20ToStep4Branches(request, procurementProject.id);

    await loginAsR20Role(page, 'procurement');
    await transitionR16Task(request, procurementProject.id, 'PAINT_PROCUREMENT', 'submit');
    let workflow = await fetchR16Workflow(request, procurementProject.id);
    expect(workflow.activeTasks.some((task) => task.nodeCode === 'FIRST_UNIT_PRODUCTION_PLAN')).toBe(true);

    await loginAsR20Role(page, 'projectManager');
    const cabProject = await createR20ProjectByApi(request, 'rework');
    await advanceR20ToCabReview(request, cabProject.id);
    workflow = await fetchR16Workflow(request, cabProject.id);
    const cabTask = workflow.activeTasks.find((task) => task.nodeCode === 'CAB_REVIEW');
    expect(cabTask).toBeTruthy();

    await loginAsR20Role(page, 'finance');
    const financeCabApprove = await fetchR20ApiStatus(
      request,
      `/workflows/tasks/${cabTask!.id}/approve`,
      { method: 'POST', data: {} },
    );
    expect(financeCabApprove.status).toBeGreaterThanOrEqual(400);

    await loginAsR20Role(page, 'viewer');
    await page.goto(`/projects/${cabProject.id}/workflow`);
    await expect(page.getByTestId('project-workflow-page')).toBeVisible();
    await expect(page.getByTestId('task-complete-button')).toHaveCount(0);
    await page.goto(`/projects/${cabProject.id}/materials`);
    await expect(page.getByTestId('material-upload-button')).toBeDisabled();
    await saveR20Screenshot(page, testInfo, 'viewer-readonly.png');

    const viewerDirectComplete = await fetchR20ApiStatus(
      request,
      `/workflows/tasks/${cabTask!.id}/approve`,
      { method: 'POST', data: {} },
    );
    expect(viewerDirectComplete.status).toBeGreaterThanOrEqual(400);

    await logoutR20(page);
    await page.goto('/dashboard');
    await expect(page.getByText('请先登录')).toBeVisible();
    await expect(page.getByRole('link', { name: '前往登录' })).toBeVisible();
    const unauthProjects = await fetchR20ApiStatus(request, '/projects');
    expect(unauthProjects.status).toBe(401);

    await loginAsR20Role(page, 'admin');
    let restrictedSeedProject: { id: string; name: string } | undefined;
    for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
      const projectList = await apiJson<{
        items: Array<{ id: string; name: string }>;
        pagination: { totalPages: number };
      }>(request, `/projects?page=${pageNo}&pageSize=50`);
      restrictedSeedProject = projectList.items.find((item) => item.name.includes('演示项目'));
      if (restrictedSeedProject || pageNo >= projectList.pagination.totalPages) {
        break;
      }
    }

    let idorStatus: number | 'SKIPPED_NO_SEED_PROJECT' = 'SKIPPED_NO_SEED_PROJECT';
    if (restrictedSeedProject) {
      await loginAsR20Role(page, 'viewer');
      const idorResponse = await fetchR20ApiStatus(request, `/projects/${restrictedSeedProject.id}`);
      idorStatus = idorResponse.status;
      expect(idorResponse.status).toBeGreaterThanOrEqual(400);
    }

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-011',
      scenario: '不同角色权限、未登录访问和 IDOR smoke',
      role: '采购部 / 财务部 / 普通查看者 / 未登录用户',
      projects: [procurementProject, cabProject],
      financeCabApproveStatus: financeCabApprove.status,
      viewerDirectCompleteStatus: viewerDirectComplete.status,
      unauthProjectsStatus: unauthProjects.status,
      idorStatus,
      result: 'PASS',
    });
  });
});
