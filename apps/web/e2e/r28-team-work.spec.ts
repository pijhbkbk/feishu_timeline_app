import { test, expect, type Page } from '@playwright/test';

// Intercepted transport isolates UI race/retry regressions. Not a substitute for real API acceptance.
const person = { id: 'person-1', username: '001', name: '合成质量人员', email: null, departmentId: null, departmentName: null, isSystemAdmin: false, authSource: 'local', roleCodes: ['quality_engineer', 'project_manager'], permissionCodes: ['project.read', 'project.write', 'review.write'] };
async function session(page: Page, admin = false) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: true, mockEnabled: false, feishuEnabled: false, user: { ...person, isSystemAdmin: admin } } }));
  await page.route('**/api/team-tasks/overview', route => route.fulfill({ json: { activeProjects: 1, totalProjects: 1, unassignedPeople: admin ? 0 : null } }));
  await page.route('**/api/team-tasks/monthly?*', route => route.fulfill({ json: { items: [], nextCursor: null } }));
}
const task = { id: 'task-1', nodeName: '质量试验', taskRound: 1, requiredRoleCode: 'quality_engineer', status: 'READY', assignmentEpoch: 0, assigneeUserId: null, assigneeUser: null, effectiveDueAt: null, dueAt: null, project: { id: 'project-1', code: 'SYNTHETIC-01', name: '合成颜色项目' } };

test('project cards keep all six fields inside the visible list at phone, tablet and desktop widths', async ({ page }) => {
  await session(page);
  await page.route('**/api/projects?*', route => route.fulfill({ json: {
    items: [{ id: 'project-1', name: '合成颜色项目', code: 'SYNTHETIC-01', vehicleModel: '轻卡', status: 'IN_PROGRESS',
      currentNodeName: '首台生产计划', progressText: '10 / 18', currentRoleCode: 'production_operator',
      currentTaskId: 'task-1', currentTaskOwnerName: null, latestTaskUpdatedAt: '2026-09-28T00:00:00Z', earliestDueAt: '2026-09-29T00:00:00Z' }],
    nodeOptions: [], total: 1, page: 1, totalPages: 1,
  } }));
  await page.goto('/projects');
  await expect(page.getByRole('link', { name: '合成颜色项目', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator('.color-projects .work-table-wrap').evaluate(element => {
      const outer = element.getBoundingClientRect();
      return { left: outer.left, right: outer.right, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        cells: Array.from(element.querySelectorAll('tbody td')).map(cell => { const box = cell.getBoundingClientRect(); return { left: box.left, right: box.right }; }) };
    });
    expect(bounds.cells).toHaveLength(6);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    for (const cell of bounds.cells) { expect(cell.left).toBeGreaterThanOrEqual(bounds.left); expect(cell.right).toBeLessThanOrEqual(bounds.right); }
  }
});

test('slow claim preserves the newly selected tab and its data', async ({ page }) => {
  await session(page);
  const reads: string[] = [];
  let claimed = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/team-tasks?*', async route => {
    const view = new URL(route.request().url()).searchParams.get('view')!; reads.push(view);
    await route.fulfill({ json: { items: view === 'available' ? claimed ? [] : [task] : [{ ...task, id: 'my-task', nodeName: '我的现有工作', assigneeUserId: person.id }], nextCursor: null } });
  });
  await page.route('**/api/team-tasks/task-1/claim', async route => { await gate; claimed = true; await route.fulfill({ json: {} }); });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: '新建项目', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '可领取', exact: true }).click();
  await page.getByRole('button', { name: '领取', exact: true }).click();
  await page.getByRole('button', { name: '待我处理', exact: true }).click();
  await expect(page.getByRole('link', { name: '我的现有工作', exact: true })).toBeVisible();
  release();
  await expect(page.getByText('领取成功，可切换到“待我处理”办理。')).toBeVisible();
  await expect(page.getByRole('link', { name: '我的现有工作', exact: true })).toBeVisible();
  expect(reads.at(-1)).toBe('mine');
  await expect(page.getByRole('button', { name: '待我处理', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('candidate loading can retry the same empty search', async ({ page }) => {
  await session(page, true);
  await page.route('**/api/team-tasks?*', route => route.fulfill({ json: { items: [task], nextCursor: null } }));
  let allowCandidates = false;
  await page.route('**/api/people?*', route => { return route.fulfill(!allowCandidates ? { status: 503, json: { message: '人员服务暂时不可用' } } : { json: { items: [{ id: 'other', name: '合成接收人', username: '002' }], nextCursor: null } }); });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: '转派', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('人员服务暂时不可用');
  allowCandidates = true;
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(1);
  await expect(page.getByText('合成接收人')).toBeVisible();
});

test('monthly deep link selects month two and submits its period, not month one', async ({ page }) => {
  await session(page);
  const month = (n: number) => ({ id: `month-${n}`, periodIndex: n, periodLabel: `2026-0${n}`, plannedDate: `2026-0${n}-15T00:00:00.000Z`, dueAt: null, reviewerId: person.id, status: 'PENDING' });
  const workspace = { project: { id: 'project-1', code: 'SYNTHETIC-01', name: '合成颜色项目', currentNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', currentNodeName: '月度评审', targetDate: null, riskLevel: 'MEDIUM' }, massProductionCompleted: true, monthlyPlanActive: true, recurringTasks: [month(1), month(2)], activeTask: { id: 'parent-17', status: 'IN_PROGRESS' }, downstreamTask: null, items: [] as unknown[] };
  let posted: Record<string, string> | null = null;
  await page.route('**/api/projects/project-1/reviews/visual-delta', route => {
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON();
      workspace.items = [{ ...posted, id: 'record-2', workflowTaskId: 'parent-17', reviewPeriod: '2026-02', reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', isPeriodCompleted: false, reviewerName: person.name, submittedAt: null, attachment: null, attachmentHistory: [], returnToNodeCode: null, returnToNodeName: null }];
    }
    return route.fulfill({ json: workspace });
  });
  await page.goto('/projects/project-1/color-evaluation?recurringTaskId=month-2');
  await expect(page.getByLabel('评审月份')).toHaveValue('month-2');
  await expect(page.getByLabel('评审日期')).toHaveValue('2026-02-15');
  await page.getByLabel('评审意见').fill('第二个月合成评审');
  await page.getByRole('button', { name: '保存评审记录', exact: true }).click();
  await expect(page.getByText('评审记录已保存，请上传必要附件后提交。')).toBeVisible();
  expect(posted).toMatchObject({ reviewDate: '2026-02-15', reviewerId: person.id });
  await page.reload();
  await expect(page.getByLabel('评审月份')).toHaveValue('month-2');
  await expect(page.getByText('第二个月合成评审')).toBeVisible();
});

test('project creation has the minimal fields and retries an uncertain request with the same identity', async ({ page }) => {
  await session(page);
  const writes: Array<{ key: string | undefined; body: Record<string, unknown> }> = [];
  await page.route('**/api/projects', async route => {
    writes.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    await route.fulfill({ status: 503, json: { message: '服务暂时不可用，请重试' } });
  });
  await page.goto('/projects/new');
  await expect(page.getByLabel('项目 / 定制色名称 *')).toBeVisible();
  await expect(page.getByText('项目成员', { exact: true })).toHaveCount(0);
  await page.getByLabel('项目 / 定制色名称 *').fill('合成苍蓝');
  await page.getByLabel('适用车型').fill('合成轻卡');
  await page.getByLabel('计划开始日期').fill('2026-09-28');
  await page.getByLabel('需求说明').fill('合成需求');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByText('服务暂时不可用，请重试', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0]?.key).toBeTruthy();
  expect(writes[1]?.key).toBe(writes[0]?.key);
  expect(writes[0]?.body).toEqual({ name: '合成苍蓝', vehicleModel: '合成轻卡', plannedStartDate: '2026-09-28', description: '合成需求', priority: 'MEDIUM' });
});

function workContext(taskId = 'task-1', writable = true) {
  return { taskVersion: 'version-1', task: { taskId, projectId: 'project-1', nodeCode: 'STANDARD_BOARD_ARCHIVE', stepName: '标准板归档', roundNo: 1, project: { name: '合成颜色项目' }, owner: { id: person.id, name: person.name } },
    progressSubmissionEnabled: writable, availableActions: writable ? [{ action: 'UPLOAD_MATERIAL' }] : [],
    materials: { requirements: [{ id: 'archive', name: '归档凭证', required: true, status: 'MISSING', currentAttachment: null }], current: [], versions: [] }, progressHistory: [] as unknown[] };
}

test('ordinary work retries with one request identity and reloads the saved history', async ({ page }) => {
  await session(page);
  const context = workContext(); const writes: Array<{ key: string | undefined; body: Record<string, unknown> }> = [];
  await page.route('**/api/v2/tasks/task-1/progress-context', route => route.fulfill({ json: context }));
  await page.route('**/api/v2/tasks/task-1/progress-updates', route => {
    const body = route.request().postDataJSON(); writes.push({ key: route.request().headers()['idempotency-key'], body });
    if (writes.length === 1) return route.fulfill({ status: 503, json: { message: '保存结果尚未确认，请重试' } });
    context.progressHistory = [{ id: 'progress-1', ...body, submittedBy: { name: person.name }, createdAt: new Date().toISOString() }];
    context.taskVersion = 'version-2'; return route.fulfill({ json: {} });
  });
  await page.goto('/projects/project-1/tasks/task-1');
  await page.getByLabel('已完成工作 *').fill('已完成合成归档');
  await page.getByLabel('下一步计划').fill('核对材料后完成工序');
  await page.getByRole('button', { name: '保存进展', exact: true }).click();
  await expect(page.locator('.task-workspace').getByRole('alert')).toHaveText('保存结果尚未确认，请重试');
  await page.getByRole('button', { name: '保存进展', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('工作进展已保存。');
  expect(writes[1]?.key).toBe(writes[0]?.key);
  expect(writes[0]?.body).toMatchObject({ taskVersion: 'version-1', completedWork: '已完成合成归档', progressStatus: 'IN_PROGRESS' });
  await page.reload(); await expect(page.locator('ol')).toContainText('已完成合成归档');
});

test('ordinary work respects read-only actions and shows a failed context retry', async ({ page }) => {
  await session(page); let failed = true;
  await page.route('**/api/v2/tasks/task-1/progress-context', route => route.fulfill(failed ? { status: 503, json: { message: '工作单读取失败' } } : { json: workContext('task-1', false) }));
  await page.goto('/projects/project-1/tasks/task-1'); await expect(page.getByRole('main').getByRole('alert')).toContainText('工作单读取失败');
  failed = false; await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByText('当前为查看模式。办理工作需具备相应角色并领取任务。')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存进展' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '上传材料' })).toHaveCount(0);
});

test('work-sheet material links request the authenticated API download route', async ({ page }) => {
  await session(page);
  const attachment = { id: 'attachment-1', fileName: '归档凭证.txt', downloadUrl: '/v2/tasks/task-1/materials/attachment-1/content', materialType: 'archive', versionNo: 1, isCurrent: true, uploadedByName: person.name };
  const context = { ...workContext(), materials: { requirements: [{ id: 'archive', name: '归档凭证', required: true, status: 'SUBMITTED', currentAttachment: attachment }], current: [attachment], versions: [attachment] } };
  await page.route('**/api/v2/tasks/task-1/progress-context', route => route.fulfill({ json: context }));
  let downloaded = 0;
  await page.route('**/api/v2/tasks/task-1/materials/attachment-1/content', route => {
    downloaded++; return route.fulfill({ status: 200, headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="archive.txt"' }, body: 'synthetic archive evidence' });
  });
  await page.goto('/projects/project-1/tasks/task-1');
  const file = page.waitForEvent('download'); await page.getByRole('link', { name: '归档凭证.txt', exact: true }).first().click();
  expect(await (await file).failure()).toBeNull(); expect(downloaded).toBe(1);
  await page.getByText('材料与版本记录（1）').click();
  const second = page.waitForEvent('download'); await page.getByRole('link', { name: '归档凭证.txt', exact: true }).last().click();
  expect(await (await second).failure()).toBeNull(); expect(downloaded).toBe(2);
});
