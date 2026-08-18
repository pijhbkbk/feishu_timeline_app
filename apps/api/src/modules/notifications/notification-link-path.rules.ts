export const NOTIFICATION_LINK_PATH_INVALID = 'NOTIFICATION_LINK_PATH_INVALID';

export type NotificationLinkPathParseResult =
  | {
      ok: true;
      original: string | null;
      normalized: string | null;
    }
  | {
      ok: false;
      code: typeof NOTIFICATION_LINK_PATH_INVALID;
    };

export class NotificationLinkPathValidationError extends Error {
  readonly code = NOTIFICATION_LINK_PATH_INVALID;

  constructor() {
    super('Notification link path is invalid.');
    this.name = 'NotificationLinkPathValidationError';
  }
}

const NOTIFICATION_LINK_BASE_ORIGIN = 'https://notification-link.invalid';
const MAX_NOTIFICATION_LINK_PATH_LENGTH = 2048;

export function parseNotificationLinkPath(
  input: unknown,
): NotificationLinkPathParseResult {
  if (input === null) {
    return { ok: true, original: null, normalized: null };
  }

  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > MAX_NOTIFICATION_LINK_PATH_LENGTH ||
    input !== input.trim() ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    hasControlCharacter(input)
  ) {
    return invalidResult();
  }

  try {
    const parsed = new URL(input, NOTIFICATION_LINK_BASE_ORIGIN);
    if (parsed.origin !== NOTIFICATION_LINK_BASE_ORIGIN) {
      return invalidResult();
    }

    const normalized = serializeNotificationLinkPath(parsed);
    if (!isAdmittedInternalPath(normalized)) {
      return invalidResult();
    }

    const secondPass = new URL(normalized, NOTIFICATION_LINK_BASE_ORIGIN);
    if (
      secondPass.origin !== NOTIFICATION_LINK_BASE_ORIGIN ||
      serializeNotificationLinkPath(secondPass) !== normalized
    ) {
      return invalidResult();
    }

    return {
      ok: true,
      original: input,
      normalized,
    };
  } catch {
    return invalidResult();
  }
}

export function normalizeNotificationLinkPathForWrite(input: unknown) {
  const result = parseNotificationLinkPath(input);
  if (!result.ok) {
    throw new NotificationLinkPathValidationError();
  }

  return result.normalized;
}

export function sanitizeNotificationLinkPathForRead(input: unknown) {
  const result = parseNotificationLinkPath(input);
  return result.ok ? result.original : null;
}

function invalidResult(): NotificationLinkPathParseResult {
  return { ok: false, code: NOTIFICATION_LINK_PATH_INVALID };
}

function serializeNotificationLinkPath(value: URL) {
  return `${value.pathname}${value.search}${value.hash}`;
}

function isAdmittedInternalPath(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_NOTIFICATION_LINK_PATH_LENGTH &&
    value === value.trim() &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !hasControlCharacter(value)
  );
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }

  return false;
}
