import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../styles/r26-v2.css', import.meta.url),
  'utf8',
);

describe('R26 Gate 3C1 completion panel responsiveness', () => {
  it('keeps the completion panel full-screen on mobile', () => {
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.r26-completion-drawer\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/,
    );
  });
});
