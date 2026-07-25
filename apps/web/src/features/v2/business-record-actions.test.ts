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
      getR26BusinessRecordAction('PAINT_DEVELOPMENT', 'project-1'),
    ).toBeNull();
  });
});
