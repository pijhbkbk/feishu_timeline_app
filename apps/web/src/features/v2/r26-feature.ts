export function isR26V2PrototypeEnabled(
  value = process.env.NEXT_PUBLIC_R26_V2_PROTOTYPE,
) {
  return value === 'true';
}
