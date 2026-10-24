import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LinkedInspectionReview } from './linked-review';

describe('linked inspection review destination', () => {
  it('returns an actual review draft to its original stage without a null month', () => {
    const html = renderToStaticMarkup(<LinkedInspectionReview projectId="project-a" recurringTaskId={null} submitted={false} />);
    expect(html).toContain('已关联实际目视评审。');
    expect(html).toContain('尚未完成阶段确认');
    expect(html).toContain('href="/projects/project-a/color-evaluation"');
    expect(html).not.toContain('recurringTaskId');
    expect(html).not.toContain('月度');
  });
  it('retains the selected monthly target and locked submission wording', () => {
    const html = renderToStaticMarkup(<LinkedInspectionReview projectId="project-a" recurringTaskId="month-1" periodLabel="2026-09" submitted />);
    expect(html).toContain('已关联月度目标：2026-09。');
    expect(html).toContain('事实已提交并锁定');
    expect(html).toContain('href="/projects/project-a/color-evaluation?recurringTaskId=month-1"');
    expect(html).not.toContain('草稿');
  });
  it('does not invent a project destination when an association is incomplete', () => {
    const html = renderToStaticMarkup(<LinkedInspectionReview projectId={null} recurringTaskId={null} submitted={false} />);
    expect(html).toContain('关联项目待核对');
    expect(html).not.toContain('href=');
  });
});
