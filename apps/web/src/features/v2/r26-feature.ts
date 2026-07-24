export function isR26V2PrototypeEnabled(
  value =
    process.env.NEXT_PUBLIC_R26_V2_PROTOTYPE ??
    process.env.NEXT_PUBLIC_UI_VERSION,
) {
  return value === 'v2' || value === 'true';
}
