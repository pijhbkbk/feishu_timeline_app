import { describe, expect, it } from 'vitest';

import { getR26BusinessRecordAction } from './business-record-actions';

describe('R26 business record remediation actions', () => {
  it('links step 10 to the existing first-unit production plan workflow', () => {
    expect(
      getR26BusinessRecordAction(
        'FIRST_UNIT_PRODUCTION_PLAN',
        'project / 1',
      ),
    ).toEqual({
      href: '/projects/project%20%2F%201/pilot-production',
      label: '新建并确认首台生产计划',
      guidance:
        '先新建首台生产计划，再在计划列表中点击“确认”。完成后返回项目工作区重新检查。',
    });
  });

  it('does not invent a business action for unrelated steps', () => {
    expect(
      getR26BusinessRecordAction('UNKNOWN_NODE', 'project-1'),
    ).toBeNull();
  });
  it('opens actual visual reviews without requiring a new monthly obligation', () => {
    const action = getR26BusinessRecordAction('VISUAL_COLOR_DIFFERENCE_REVIEW', 'project-a');
    expect(action?.href).toBe('/projects/project-a/color-evaluation');
    expect(action?.label).toBe('办理目视色差评审');
    expect(action?.guidance).toContain('按实际抽检日期');
    expect(action?.guidance).toContain('已有历史期次');
    expect(action?.guidance).not.toContain('已领取且到期');
  });

});
