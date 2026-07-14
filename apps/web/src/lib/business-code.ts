const SEED_BUSINESS_CODE_PATTERN = /(?:^|[-_])DEMO(?:[-_]|$)/i;

export function isSeedBusinessCode(value: string | null | undefined) {
  return Boolean(value?.trim() && SEED_BUSINESS_CODE_PATTERN.test(value.trim()));
}

export function formatBusinessCode(
  value: string | null | undefined,
  seedFallback: string,
) {
  const normalized = value?.trim();

  if (!normalized || isSeedBusinessCode(normalized)) {
    return seedFallback;
  }

  return normalized;
}

export function formatOptionalBusinessCode(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || isSeedBusinessCode(normalized)) {
    return null;
  }

  return normalized;
}
