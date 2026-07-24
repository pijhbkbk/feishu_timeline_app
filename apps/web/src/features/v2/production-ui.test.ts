import { describe, expect, it } from 'vitest';

import {
  isFormalV2Path,
  isProductionV2Ui,
  toProductHref,
} from './production-ui';

describe('production V2 routing', () => {
  it('recognizes only the explicit production UI version', () => {
    expect(isProductionV2Ui('v2')).toBe(true);
    expect(isProductionV2Ui('v1')).toBe(false);
    expect(isProductionV2Ui(undefined)).toBe(false);
  });

  it('recognizes formal application routes without matching login', () => {
    expect(isFormalV2Path('/dashboard')).toBe(true);
    expect(isFormalV2Path('/projects/project-1')).toBe(true);
    expect(isFormalV2Path('/admin/audit-logs')).toBe(true);
    expect(isFormalV2Path('/login')).toBe(false);
    expect(isFormalV2Path('/legacy/dashboard')).toBe(false);
  });

  it('keeps compatibility aliases unless production V2 is enabled', () => {
    expect(
      toProductHref(
        '/v2/projects/project-1?taskId=task-1',
        undefined,
      ),
    ).toBe(
      '/v2/projects/project-1?taskId=task-1',
    );
    expect(
      toProductHref('/v2/projects/project-1?taskId=task-1', 'v2'),
    ).toBe(
      '/projects/project-1?taskId=task-1',
    );
  });
});
