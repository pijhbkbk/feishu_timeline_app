import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../styles/r26-v2.css', import.meta.url),
  'utf8',
);
const auditWorkspaceSource = readFileSync(
  new URL('../../components/admin-audit-workspace-r25a.tsx', import.meta.url),
  'utf8',
);

describe('R26 formal task and admin page spacing', () => {
  it('uses the same centered desktop content frame as native V2 pages', () => {
    expect(css).toMatch(
      /\.r26-main > \.r22-tasks-page,[\s\S]*?\.r26-main > \.r22-admin-page\s*\{[\s\S]*?width:\s*min\(100%, 1504px\);[\s\S]*?margin:\s*0 auto;[\s\S]*?padding:\s*56px 32px 80px;/,
    );
  });

  it('preserves readable tablet and mobile gutters', () => {
    expect(css).toMatch(
      /@media \(max-width: 1279px\)[\s\S]*?\.r26-main > \.r22-tasks-page,[\s\S]*?padding-right:\s*24px;[\s\S]*?padding-left:\s*24px;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.r26-main > \.r22-tasks-page,[\s\S]*?padding:\s*32px 20px 48px;/,
    );
  });

  it('places the audit workspace inside the native V2 page frame', () => {
    expect(auditWorkspaceSource).toContain(
      'className="r22-page r26-page r25a-audit-page"',
    );
  });
});
