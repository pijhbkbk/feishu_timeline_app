/**
 * Checked-in development identity.
 *
 * The image build replaces this file with release-specific immutable values.
 * Runtime environment variables must never be used as the actual identity.
 */
export const IMMUTABLE_BUILD_IDENTITY = Object.freeze({
  sourceCommit: 'development',
  sourceTree: 'development',
  release: 'development',
  buildTime: '1970-01-01T00:00:00Z',
});
