import { describe,expect,it } from 'vitest';
import {nodeReturnHref,taskHref} from './context';
describe('M1 controlled route context',()=>{
 it('returns to the same workbench color and task',()=>{expect(nodeReturnHref('p1','t4','from=dashboard')).toBe('/dashboard?project=p1&taskId=t4');});
 it('retains project tab and list filters without an arbitrary URL',()=>{expect(nodeReturnHref('p1','t4','from=project&tab=materials&listKeyword=灰色&listStage=PAINT_DEVELOPMENT&listPage=2')).toBe('/projects/p1?tab=materials&taskId=t4&listKeyword=%E7%81%B0%E8%89%B2&listStage=PAINT_DEVELOPMENT&listPage=2&from=list');});
 it.each(['','from=https://evil.test','from=//evil.test','from=dashboard&from=project','returnTo=https://evil.test'])('deep links and invalid sources fall back to project: %s',search=>{expect(nodeReturnHref('p1','t4',search)).toBe('/projects/p1');});
 it('ignores arbitrary tabs and returnTo',()=>{expect(nodeReturnHref('p1','t4','from=project&tab=https://evil.test&returnTo=https://evil.test')).toBe('/projects/p1?tab=flow&taskId=t4');});
 it('carries only bounded list context when entering a node',()=>{expect(taskHref('p1','t4','project','listPage=3&returnTo=https://evil.test')).toBe('/projects/p1/tasks/t4?from=project&tab=flow&listPage=3');});
});
