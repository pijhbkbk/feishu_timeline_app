import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ColorsPage from './colors/page';
import ReviewsPage from './reviews/page';
import SettingsPage from './settings/page';

describe('compatibility routes', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it.each([
    ['reviews', ReviewsPage, '/projects'],
    ['settings', SettingsPage, '/admin'],
    ['colors', ColorsPage, '/admin/color-database'],
  ])('redirects /%s to its supported destination', (_route, page, destination) => {
    page();

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith(destination);
  });

  it('does not expose a project-section fallback route', () => {
    const fallbackPage = fileURLToPath(
      new URL('./projects/[projectId]/[section]/page.tsx', import.meta.url),
    );

    expect(existsSync(fallbackPage)).toBe(false);
  });
});
