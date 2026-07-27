import { describe, expect, it } from 'vitest';

import { shouldShowNodeCornerMarker } from './flow-map';

describe('R26 flow map node copy layout', () => {
  it('does not repeat the created marker on completed or special-shape nodes', () => {
    expect(
      shouldShowNodeCornerMarker({ shape: 'rounded' }, 'COMPLETED', true),
    ).toBe(false);
    expect(
      shouldShowNodeCornerMarker({ shape: 'monthly' }, 'MONTHLY_TRACKING', true),
    ).toBe(false);
    expect(
      shouldShowNodeCornerMarker({ shape: 'terminal' }, 'COMPLETED', true),
    ).toBe(false);
    expect(
      shouldShowNodeCornerMarker({ shape: 'decision' }, 'PENDING_REVIEW', true),
    ).toBe(false);
  });

  it('keeps a concise marker only where it adds state information', () => {
    expect(
      shouldShowNodeCornerMarker({ shape: 'rounded' }, 'NOT_STARTED', true),
    ).toBe(true);
    expect(
      shouldShowNodeCornerMarker({ shape: 'branch' }, 'PENDING', true),
    ).toBe(true);
    expect(
      shouldShowNodeCornerMarker(
        { shape: 'rounded', isBlocked: true },
        'OVERDUE',
        true,
      ),
    ).toBe(true);
  });
});
