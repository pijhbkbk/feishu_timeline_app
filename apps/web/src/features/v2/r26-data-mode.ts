export function isR26ReadOnlyRealDataEnabled(
  value = process.env.NEXT_PUBLIC_R26_V2_DATA_MODE,
) {
  return value === 'read-only-real';
}
