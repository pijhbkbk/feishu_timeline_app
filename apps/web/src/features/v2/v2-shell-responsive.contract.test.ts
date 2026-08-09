import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/r26-v2.css'), 'utf8');
const legacyCss = readFileSync(resolve(process.cwd(), 'src/app/r22.css'), 'utf8');
const v2Shell = readFileSync(resolve(process.cwd(), 'src/features/v2/v2-shell.tsx'), 'utf8');
const appShell = readFileSync(resolve(process.cwd(), 'src/components/app-shell.tsx'), 'utf8');

function mediaSection(marker: string) {
  const start = css.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing responsive CSS marker: ${marker}`);
  }

  const next = css.indexOf('@media', start + marker.length);
  return css.slice(start, next < 0 ? css.length : next);
}

describe('V2 shell responsive navigation contract', () => {
  it('keeps the primary navigation visible throughout the tablet-width range', () => {
    const tablet = mediaSection('@media (min-width: 768px) and (max-width: 920px)');

    expect(tablet).toMatch(/\.r26-primary-nav\s*\{[\s\S]*?display:\s*flex;/);
    expect(tablet).toContain('.r26-brand__copy');
    expect(tablet).toContain('display: none;');
  });

  it('keeps the primary navigation in the page header below 768px', () => {
    const mobile = mediaSection('@media (max-width: 767px)');

    expect(mobile).toMatch(/\.r26-primary-nav\s*\{[\s\S]*?display:\s*flex;/);
    expect(mobile).toMatch(/\.r26-primary-nav\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
    expect(mobile).not.toContain('.r26-mobile-nav');
  });

  it('does not hide the primary navigation in the shared 920px content breakpoint', () => {
    const content = mediaSection('@media (max-width: 920px)');

    expect(content).not.toContain('.r26-primary-nav');
  });

  it('does not render a second fixed bottom navigation', () => {
    expect(v2Shell).not.toContain('r26-mobile-nav');
    expect(css).not.toContain('.r26-mobile-nav');
  });
});

describe('shared application shell responsive navigation contract', () => {
  it('keeps the shared primary navigation in the page header on narrow screens', () => {
    const start = legacyCss.indexOf('@media (max-width: 820px)');
    const next = legacyCss.indexOf('@media', start + 1);
    const mobile = legacyCss.slice(start, next < 0 ? legacyCss.length : next);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(mobile).toMatch(/\.r22-primary-nav\s*\{[\s\S]*?display:\s*flex;/);
    expect(mobile).toMatch(/\.r22-primary-nav\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
    expect(mobile).not.toContain('.r22-mobile-nav');
  });

  it('does not render a second fixed bottom navigation', () => {
    expect(appShell).not.toContain('r22-mobile-nav');
    expect(legacyCss).not.toContain('.r22-mobile-nav');
  });
});
