import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
import { ProjectTrackingLinks } from './project-overview';
it('links natural-week inspection and actual monthly facts separately while retaining both project flows',()=>{
 const html=renderToStaticMarkup(<ProjectTrackingLinks projectPath="/projects/synthetic-project"/>);
 expect(html).toContain('href="/inspections">周评与日常检验');expect(html).toContain('href="/production">月度实际产量');
 expect(html).toContain('href="/projects/synthetic-project/color-evaluation">项目月度评审（既有流程）');expect(html).toContain('href="/projects/synthetic-project/mass-production">项目量产记录（流程）');expect(html).toContain('保存事实不会自动完成本项目流程');
});
