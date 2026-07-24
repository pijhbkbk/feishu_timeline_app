export function isR26ReadOnlyRealDataEnabled(
  value =
    process.env.NEXT_PUBLIC_R26_V2_DATA_MODE ??
    process.env.NEXT_PUBLIC_UI_DATA_MODE,
) {
  return value === 'real' || value === 'read-only-real';
}
