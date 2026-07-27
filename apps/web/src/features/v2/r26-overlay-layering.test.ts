import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../styles/r26-v2.css', import.meta.url),
  'utf8',
);

describe('R26 global overlay layering', () => {
  it('raises the account menu above workflow drawers only while it is open', () => {
    const accountLayer = css.match(
      /\.r26-app-header:has\(\.r26-account-menu\[open\]\)\s*\{[\s\S]*?z-index:\s*(\d+);/,
    );
    const workflowDrawerLayer = css.match(
      /\.r26-gate3-drawer-backdrop\s*\{[\s\S]*?z-index:\s*(\d+);/,
    );

    expect(accountLayer).not.toBeNull();
    expect(workflowDrawerLayer).not.toBeNull();
    expect(Number(accountLayer?.[1])).toBeGreaterThan(
      Number(workflowDrawerLayer?.[1]),
    );
  });
});
