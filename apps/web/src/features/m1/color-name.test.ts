import { expect, it } from 'vitest';
import { displayColorName } from './color-name';
it('keeps new colors distinguishable before color numbering creates master data', () => {
  expect(displayColorName('暖白', '未关联颜色')).toBe('暖白');
  expect(displayColorName('灰绿', '未关联颜色')).toBe('灰绿');
  expect(displayColorName('项目名称', '已登记颜色')).toBe('已登记颜色');
});
