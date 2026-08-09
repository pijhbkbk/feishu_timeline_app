import { describe, expect, it } from 'vitest';

import {
  BUSINESS_DIVISION_CODES,
  BUSINESS_DIVISIONS,
  isBusinessDivision,
} from './admin-organization.constants';

describe('admin organization business divisions', () => {
  it('exposes exactly the six governed business divisions in product order', () => {
    expect(BUSINESS_DIVISIONS.map((division) => division.name)).toEqual([
      '技术中心',
      '商用车营销事业部',
      '乘用车营销事业部',
      '制造中心',
      '国际事业部',
      '采购中心',
    ]);
    expect(BUSINESS_DIVISION_CODES).toHaveLength(6);
  });

  it('accepts only an exact governed code and name pair', () => {
    expect(
      isBusinessDivision({ code: 'BU_TECHNOLOGY', name: '技术中心' }),
    ).toBe(true);
    expect(
      isBusinessDivision({ code: 'BU_TECHNOLOGY', name: '工艺开发部' }),
    ).toBe(false);
    expect(isBusinessDivision({ code: 'PROCESS', name: '技术中心' })).toBe(
      false,
    );
  });
});
