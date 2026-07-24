const FORMAL_V2_PREFIXES = [
  '/dashboard',
  '/projects',
  '/tasks',
  '/progress',
  '/materials',
  '/admin',
];

export function isProductionV2Ui(
  value = process.env.NEXT_PUBLIC_UI_VERSION,
) {
  return value === 'v2';
}

export function isFormalV2Path(pathname: string) {
  return FORMAL_V2_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function toProductHref(
  v2Href: string,
  uiVersion = process.env.NEXT_PUBLIC_UI_VERSION,
) {
  if (!isProductionV2Ui(uiVersion)) {
    return v2Href;
  }

  return v2Href.replace(/^\/v2(?=\/|$)/, '') || '/dashboard';
}
