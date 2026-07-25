import { describe, expect, it } from 'vitest';

import {
  getR26LifecycleActionBySlug,
  getR26LifecycleActionByStep,
  getR26LifecycleActionHref,
  R26_LIFECYCLE_ACTIONS,
} from './lifecycle-actions';

describe('R26 Gate 3C2 / 3C3 lifecycle actions', () => {
  it('exposes exactly one server-backed action for every step from 12 to 18', () => {
    expect(R26_LIFECYCLE_ACTIONS.map((action) => action.stepNumber)).toEqual([
      12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(new Set(R26_LIFECYCLE_ACTIONS.map((action) => action.slug)).size).toBe(
      7,
    );
  });

  it('keeps monthly review and color exit as separate governance actions', () => {
    expect(getR26LifecycleActionByStep(17)?.slug).toBe('monthly-review');
    expect(getR26LifecycleActionByStep(18)?.slug).toBe('color-exit');
    expect(getR26LifecycleActionByStep(11)).toBeNull();
  });

  it('builds an encoded V2 route and rejects unknown actions', () => {
    expect(getR26LifecycleActionHref('project / 1', 12)).toBe(
      '/v2/projects/project%20%2F%201/actions/cabin-review',
    );
    expect(getR26LifecycleActionBySlug('unknown')).toBeNull();
  });
});
