import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeamWorkContent, type WorkRow } from './team-workspace';

const row: WorkRow = { id: 'synthetic-task', kind: 'ordinary', title: '油漆采购', detail: '第 2 轮', projectId: 'synthetic-project',
  projectCode: 'COLOR-01', projectName: '合成蓝色项目', role: 'purchaser', owner: null, dueAt: null, status: 'READY', epoch: 2,
  href: '/projects/synthetic-project?taskId=synthetic-task' };
const defaults = { rows: [] as WorkRow[], loading: false, error: '', overview: { totalProjects: 3, activeProjects: 2, unassignedPeople: 1 },
  view: 'mine' as const, userId: 'synthetic-person', roleCodes: ['purchaser'], admin: false, canCreate: false, subject: false, busy: '',
  onReload() {}, onClaim() {}, onTransfer() {} };
const render = (props: Partial<React.ComponentProps<typeof TeamWorkContent>> = {}) => renderToStaticMarkup(<TeamWorkContent {...defaults} {...props} />);
describe('role work queue presentation', () => {
  it('distinguishes no personal work from no projects', () => {
    const html = render();
    expect(html).toContain('当前没有待处理工作');
    expect(html).toContain('打开颜色项目');
    expect(html).not.toContain('没有项目');
    expect(html).not.toContain('新建项目');
  });
  it('exposes personnel counts and project creation only to authorized viewers', () => {
    expect(render({ admin: true, canCreate: true })).toContain('待分配人员');
    expect(render({ admin: true, canCreate: true })).toContain('href="/projects/new"');
    expect(render()).not.toContain('待分配人员');
  });
  it.each(['无权访问', '连接失败'])('does not turn %s into successful empty data', error => {
    const html = render({ error, rows: [row] });
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('合成蓝色项目');
    expect(html).not.toContain('当前没有');
  });
  it('hides stale rows and counts while loading', () => {
    const html = render({ loading: true, rows: [row] });
    expect(html).toContain('正在加载工作');
    expect(html).not.toContain('COLOR-01');
    expect(html).not.toContain('进行中');
  });
  it('offers a claim for a shared role task and a real project deep link', () => {
    const html = render({ rows: [row], view: 'available' });
    expect(html).toContain('>领取</button>');
    expect(html).toContain(row.href);
    expect(html).toContain('第 2 轮');
  });
  it('does not let administrator identity alone display a business claim or signature action', () => {
    const html = render({ rows: [row], admin: true, roleCodes: [] });
    expect(html).toContain('>转派</button>');
    expect(html).not.toContain('>领取</button>');
    expect(html).not.toContain('>处理</a>');
  });
  it('offers processing only to the current qualified owner and shows history without write controls', () => {
    expect(render({ rows: [{ ...row, owner: defaults.userId }] })).toContain('>处理</a>');
    expect(render({ rows: [{ ...row, owner: 'other' }] })).not.toContain('>处理</a>');
    const history = render({ rows: [{ ...row, owner: defaults.userId, status: 'COMPLETED' }], view: 'completed', admin: true });
    expect(history).toContain('已完成');
    expect(history).not.toContain('>转派</button>');
    expect(history).not.toContain('>处理</a>');
  });
});
