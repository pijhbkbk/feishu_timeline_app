// Synthetic-only fixture: no API calls, user files, or persistent browser profile.
import { createFreeWorkbook, type WorkbookRuntime } from '../../../apps/web/src/features/free-workbook/runtime';
import { blankWorkbook } from '../../../apps/web/src/features/free-workbook/contract';
import type { IWorkbookData } from '@univerjs/core';
const state = window as unknown as {runtime: WorkbookRuntime; changed: number; errors: string[]; reopen(): Promise<void>};
state.changed = 0;
state.errors = [];
const data = blankWorkbook('10000000-0000-4000-8000-000000000001', '合成回归');
if (!new URLSearchParams(location.search).has('blank')) data.sheets[data.sheetOrder[0]!]!.cellData = {
  0: {0: {v: '原始A1'}, 1: {v: 2}}, 1: {1: {f: '=SUM(B1:B1)'}}, 17: {2: {v: '插入位置'}},
};
async function start(snapshot: IWorkbookData) {
  state.runtime = createFreeWorkbook({container: document.getElementById('canvas')!, snapshot,
    onChanged: () => state.changed++, onError: message => state.errors.push(message), onUploading: () => {}});
  await state.runtime.ready;
  await state.runtime.snapshot(); // Wait for actual formula application, not a startup delay.
  document.getElementById('status')!.textContent = 'ready';
}
state.reopen = async () => {
  const saved = await state.runtime.snapshot();
  state.runtime.dispose();
  state.changed = 0;
  await start(saved);
};
await start(data);
