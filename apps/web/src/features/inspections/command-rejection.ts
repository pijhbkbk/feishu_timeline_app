import { ApiRequestError } from '../../lib/auth-client';

/** Only for the single inspection command endpoints used by useCommand.
 * Their successful receipt is replayed before mutable business checks, so a
 * retained, identical request returning 400/409 did not commit that command.
 * 401/403/404 may occur before receipt lookup. No inspection endpoint currently
 * produces 422, so an unknown replay returning it remains unconfirmed.
 * Do not apply this rule to multi-stage form/import callbacks.
 */
export function inspectionCommandRejected(error: unknown, wasAmbiguous: boolean): boolean {
  return error instanceof ApiRequestError && (wasAmbiguous ? [400, 409] : [400, 401, 403, 404, 409, 422]).includes(error.status);
}
