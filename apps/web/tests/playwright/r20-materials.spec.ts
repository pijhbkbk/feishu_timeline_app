import { expect, test } from '@playwright/test';

import { apiJson } from './helpers';
import {
  createR20ProjectByApi,
  fetchR20ApiStatus,
  loginAsR20Role,
  logoutR20,
  saveR20Screenshot,
  uploadR20PdfMaterial,
  writeR20ApiSnapshot,
  writeR20CaseRecord,
} from './r20-fixtures';

test.describe('R20 材料提交平台 @r20', () => {
  test('R20-010 uploads, archives, previews metadata and protects material actions @r20', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAsR20Role(page, 'projectManager');
    const request = page.context().request;
    const project = await createR20ProjectByApi(request, 'permissionMaterial');

    const files = [
      'r20-step1-customer-color-sample.pdf',
      'r20-step2-development-report.pdf',
      'r20-step13-fee-voucher.pdf',
    ];

    for (const file of files) {
      await uploadR20PdfMaterial(page, project.id, file);
    }

    const workspace = await apiJson<{
      statistics: { activeCount: number };
      items: Array<{ id: string; originalFileName: string; uploadedByName: string | null }>;
    }>(request, `/projects/${project.id}/attachments`);
    expect(workspace.statistics.activeCount).toBeGreaterThanOrEqual(files.length);
    for (const file of files) {
      expect(workspace.items.some((item) => item.originalFileName === file)).toBe(true);
    }
    await writeR20ApiSnapshot(testInfo, 'materials-workspace', workspace);

    await page.goto(`/projects/${project.id}/materials`);
    await expect(page.getByTestId('materials-page')).toBeVisible();
    await expect(page.locator('table')).toContainText(files[0]!);
    await saveR20Screenshot(page, testInfo, 'materials-uploaded.png');

    await loginAsR20Role(page, 'viewer');
    await page.goto(`/projects/${project.id}/materials`);
    await expect(page.getByTestId('materials-page')).toBeVisible();
    await expect(page.getByTestId('material-upload-button')).toBeDisabled();
    await expect(page.getByTestId('material-upload-button')).toContainText('不可上传');

    const firstAttachmentId = workspace.items[0]?.id;
    expect(firstAttachmentId).toBeTruthy();
    const viewerDownload = await fetchR20ApiStatus(
      request,
      `/projects/${project.id}/attachments/${firstAttachmentId}/download`,
    );
    expect(viewerDownload.status).toBe(200);

    await logoutR20(page);
    const unauthDownload = await fetchR20ApiStatus(
      request,
      `/projects/${project.id}/attachments/${firstAttachmentId}/download`,
    );
    expect(unauthDownload.status).toBe(401);

    await writeR20CaseRecord(testInfo, {
      testId: 'R20-010',
      scenario: '材料提交平台上传、归档、下载和权限',
      role: '项目经理 / 普通查看者 / 未登录用户',
      project,
      uploadedFiles: files,
      viewerDownloadStatus: viewerDownload.status,
      unauthDownloadStatus: unauthDownload.status,
      result: 'PASS',
    });
  });
});
