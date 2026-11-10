import { describe,expect,it } from 'vitest';
import {nodeReturnHref,taskHref,recordEntryHref,recordReturnHref} from './context';
describe('M1 controlled route context',()=>{
 it('returns to the same workbench color and task',()=>{expect(nodeReturnHref('p1','t4','from=dashboard')).toBe('/dashboard?project=p1&taskId=t4');});
 it('retains project tab and list filters without an arbitrary URL',()=>{expect(nodeReturnHref('p1','t4','from=project&tab=materials&listKeyword=灰色&listStage=PAINT_DEVELOPMENT&listPage=2')).toBe('/projects/p1?tab=materials&taskId=t4&listKeyword=%E7%81%B0%E8%89%B2&listStage=PAINT_DEVELOPMENT&listPage=2&from=list');});
 it.each(['','from=https://evil.test','from=//evil.test','from=dashboard&from=project','returnTo=https://evil.test'])('deep links and invalid sources fall back to project: %s',search=>{expect(nodeReturnHref('p1','t4',search)).toBe('/projects/p1');});
 it('ignores arbitrary tabs and returnTo',()=>{expect(nodeReturnHref('p1','t4','from=project&tab=https://evil.test&returnTo=https://evil.test')).toBe('/projects/p1?tab=flow&taskId=t4');});
 it('carries only bounded list context when entering a node',()=>{expect(taskHref('p1','t4','project','listPage=3&returnTo=https://evil.test')).toBe('/projects/p1/tasks/t4?from=project&tab=flow&listPage=3');});
 it('returns from a business record through the same task to the original map and filters',()=>{
   const entry=recordEntryHref('/projects/p1/standard-boards','t7','from=project&tab=flow&listKeyword=灰色&listPage=2&returnTo=https://evil.test');
   const query=entry.split('?')[1]!;
   const back=recordReturnHref('p1',query);
   expect(back).toBe('/projects/p1/tasks/t7?from=project&tab=flow&listKeyword=%E7%81%B0%E8%89%B2&listPage=2');
   expect(nodeReturnHref('p1','t7',back.split('?')[1]!)).toContain('taskId=t7&listKeyword=%E7%81%B0%E8%89%B2&listPage=2&from=list');
 });
 it.each(['originTask=../other','originTask=t1&originTask=t2','returnTo=//evil.test'])('rejects ambiguous or unsafe task context %s',query=>{
   expect(recordReturnHref('p1',query,'materials')).toBe('/projects/p1?tab=materials');
 });
 it('never accepts an external record destination',()=>{expect(()=>recordEntryHref('https://evil.test','t7','from=dashboard')).toThrow();});
});
