import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./project-editor.tsx', import.meta.url),
  'utf8',
);
const clientSource = readFileSync(
  new URL('../lib/projects-client.ts', import.meta.url),
  'utf8',
);

describe('项目新建表单契约', () => {
  it('不再要求用户输入项目编号或市场', () => {
    expect(componentSource).not.toContain('data-testid="project-code-input"');
    expect(componentSource).not.toContain('data-testid="project-market-input"');
    expect(componentSource).not.toContain('<span>市场</span>');
  });

  it('提供颜色营销单位和固定涂料供应商选项', () => {
    expect(componentSource).toContain('data-testid="project-color-marketing-unit-input"');
    expect(componentSource).toContain('data-testid="project-paint-supplier-select"');
    for (const supplier of [
      '巴斯夫',
      '立邦',
      '艾仕得',
      '金力泰',
      '阿克苏诺贝尔',
      '兰陵化工',
    ]) {
      expect(clientSource).toContain(`value: '${supplier}'`);
    }
  });
});
