import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Run from repository root. Starts only a loopback fixture with synthetic cells.
const require = createRequire(resolve('apps/web/package.json'));
const viteRequire = createRequire(require.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
const { chromium, expect } = require('@playwright/test');
const evidence = process.env.UNIVER_RUNTIME_EVIDENCE_DIR;
const report = { cases: [], pageErrors: [], apiRequests: [] };
const server = await createServer({configFile: false, root: resolve('scripts/univer/runtime-fixture'),
  server: {host: '127.0.0.1', port: Number(process.env.UNIVER_RUNTIME_TEST_PORT ?? 3499), strictPort: true, fs: {allow: [process.cwd()]}}});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  await page.route('**/api/**', route => {report.apiRequests.push(new URL(route.request().url()).pathname);return route.abort();});
  const url = `http://127.0.0.1:${address.port}/`;
  for (const suffix of ['?blank', '']) {
    await page.goto(url + suffix);
    await expect(page.locator('#status')).toHaveText('ready', {timeout: 60000});
    assert.equal(await page.evaluate(() => window.changed), 0, 'loading must not report an unsaved user edit');
    await page.evaluate(() => window.reopen());
    assert.equal(await page.evaluate(() => window.changed), 0, 'save and recreate must remain clean');
    report.cases.push({case: suffix ? 'blank load/reopen' : 'formula load/reopen', changed: 0});
  }
  await page.mouse.click(300, 500, {button: 'right'});
  const parent = page.getByRole('button', {name: '插入', exact: true});
  await parent.hover();
  const submenu = page.locator(`[id="${await parent.getAttribute('aria-controls')}"]`);
  const assertVisible = async label => {
    await expect(submenu).toBeVisible();
    const state = await submenu.evaluate(el => ({visibility: getComputedStyle(el).visibility,
      pointerEvents: getComputedStyle(el).pointerEvents, rect: el.getBoundingClientRect().toJSON()}));
    assert.equal(state.visibility, 'visible');assert.equal(state.pointerEvents, 'auto');
    assert.ok(state.rect.left >= 0 && state.rect.top >= 0 && state.rect.right <= 1440 && state.rect.bottom <= 900);
    report.cases.push({case: label, ...state});console.log(label);
  };
  await assertVisible('hover');
  await parent.click();await assertVisible('hover then click');
  await parent.click();await assertVisible('repeat click');
  const box = await submenu.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 20);await parent.hover();await assertVisible('submenu then parent hover');
  await parent.focus();await parent.press('ArrowRight');await assertVisible('repeated keyboard open');
  assert.equal(await submenu.evaluate(el => el.contains(document.activeElement)), true, 'keyboard opens focus the first option');
  await page.keyboard.press('ArrowLeft');await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await parent.press('ArrowRight');await assertVisible('keyboard close/reopen');
  await page.locator('button[aria-haspopup="menu"]:not(:disabled)').filter({hasText: /^删除$/}).hover();
  await expect(parent).toHaveAttribute('aria-expanded', 'false');
  await parent.hover();await assertVisible('switch submenu and return');
  assert.equal(await page.evaluate(() => window.changed), 0, 'menu and selection actions are not workbook edits');
  const before = await page.evaluate(() => window.runtime.snapshot());
  await submenu.getByRole('button', {name: /在上方插入/}).click();
  await expect(parent).toBeHidden();
  const after = await page.evaluate(() => window.runtime.snapshot());
  const sheetId = after.sheetOrder[0];
  assert.equal(after.sheets[sheetId].rowCount, before.sheets[sheetId].rowCount + 1);
  assert.equal(after.sheets[sheetId].cellData[18][2].v, '插入位置');
  assert.ok(await page.evaluate(() => window.changed) > 0, 'real row insertion must mark dirty');
  report.cases.push({case: 'click insert row', rows: after.sheets[sheetId].rowCount, shiftedValue: '插入位置'});
  await page.evaluate(() => window.reopen());
  assert.equal(await page.evaluate(() => window.changed), 0);
  await page.mouse.dblclick(90, 102);
  await page.keyboard.press('End');await page.keyboard.type('edited');
  assert.ok(await page.evaluate(() => window.changed) > 0, 'uncommitted user typing must mark dirty');
  await page.keyboard.press('Enter');
  const typed = await page.evaluate(() => window.runtime.snapshot());
  assert.ok(String(typed.sheets[sheetId].cellData[0][0].v ?? typed.sheets[sheetId].cellData[0][0].p?.body?.dataStream).includes('edited'));
  await page.evaluate(() => window.reopen());
  assert.equal(await page.evaluate(() => window.changed), 0, 'typed content saved/reopened must remain clean');
  const reopened = await page.evaluate(() => window.runtime.snapshot());
  assert.deepEqual(reopened.sheets[sheetId].cellData[0][0], typed.sheets[sheetId].cellData[0][0]);
  assert.deepEqual(await page.evaluate(() => window.errors), []);
  report.cases.push({case: 'typing before commit and snapshot/reopen', changedAfterReopen: 0});
  assert.deepEqual(report.pageErrors, []);assert.deepEqual(report.apiRequests, []);
  if (evidence) {await mkdir(evidence, {recursive: true});await page.screenshot({path: resolve(evidence, 'workbook-runtime.png')});}
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';report.error = String(error);throw error;
} finally {
  if (evidence) {await mkdir(evidence, {recursive: true});await writeFile(resolve(evidence, 'workbook-runtime.json'), JSON.stringify(report, null, 2));}
  await browser?.close();await server.close();console.log(JSON.stringify(report, null, 2));
}
