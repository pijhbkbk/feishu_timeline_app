import { Prisma } from '@prisma/client';
import { commandHash } from '../color-register/color-register.rules';
import { MAX_MODELS_PER_MONTH, MONTHLY_ACTUAL_SCOPE, MONTHLY_MODEL_SCOPE } from './production-facts.rules';

export const operationalProductionWhere = { sourceRowId: null, metricScope: { in: [MONTHLY_ACTUAL_SCOPE, MONTHLY_MODEL_SCOPE] } } satisfies Prisma.ColorProductionFactWhereInput;
export const PRODUCTION_SNAPSHOT_SELECT = { id: true, month: true, metricScope: true, vehicleModel: true, quantity: true, revision: true } satisfies Prisma.ColorProductionFactSelect;
type Fact = Prisma.ColorProductionFactGetPayload<{ select: typeof PRODUCTION_SNAPSHOT_SELECT }>;
type Basis = { mode: string; revision: number; snapshotHash: string };

/** One shared interpretation for reconciliation and annual review. No quantity is stored in a basis. */
export function resolveProductionMonth(month: string, facts: Fact[], basis: Basis | null) {
  const totals = facts.filter(fact => fact.metricScope === MONTHLY_ACTUAL_SCOPE);
  const models = facts.filter(fact => fact.metricScope === MONTHLY_MODEL_SCOPE);
  const invalid = totals.length > 1 || models.length > MAX_MODELS_PER_MONTH ||
    facts.some(fact => fact.quantity !== null && (!fact.quantity.isInteger() || fact.quantity.isNegative()));
  const mode = basis?.mode ?? (totals.length && models.length ? null : totals.length ? 'MONTH_TOTAL' : models.length ? 'MODEL_DETAILS' : null);
  const selected = mode === 'MONTH_TOTAL' ? totals : mode === 'MODEL_DETAILS' ? models : [];
  const reconciliationRequired = facts.length > 0 && (!mode || selected.length === 0);
  const unknown = selected.some(fact => fact.quantity === null);
  const quantity = !invalid && !reconciliationRequired && selected.length && !unknown
    ? selected.reduce((sum, fact) => sum + BigInt(fact.quantity!.toFixed(0)), 0n).toString() : null;
  const identities = facts.map(fact => ({ id: fact.id, scope: fact.metricScope, vehicleModel: fact.vehicleModel, revision: fact.revision, quantity: fact.quantity?.toString() ?? null })).sort((a, b) => a.id.localeCompare(b.id));
  const snapshotHash = commandHash({ month, facts: identities, basis: basis ? { mode: basis.mode, revision: basis.revision } : null });
  return { month, mode, revision: basis?.revision ?? 0, selectionSnapshotHash: basis?.snapshotHash ?? null, snapshotHash,
    totalQuantity: totals[0]?.quantity?.toString() ?? null, totalFactId: totals[0]?.id ?? null,
    modelCount: models.length, modelKnownQuantity: invalid ? null : models.reduce((sum, fact) => sum + (fact.quantity === null ? 0n : BigInt(fact.quantity.toFixed(0))), 0n).toString(),
    modelUnknownCount: models.filter(fact => fact.quantity === null).length, quantity, reconciliationRequired, invalid,
    facts: identities, hasFacts: facts.length > 0 };
}

export async function readProductionMonth(db: Prisma.TransactionClient, input: { colorId: string; baseId: string; month: string }) {
  const [facts, basis] = await Promise.all([
    db.colorProductionFact.findMany({ where: { colorId: input.colorId, productionBaseId: input.baseId, month: input.month, ...operationalProductionWhere },
      select: PRODUCTION_SNAPSHOT_SELECT, orderBy: { id: 'asc' }, take: MAX_MODELS_PER_MONTH + 2 }),
    db.colorProductionBasis.findUnique({ where: { colorId_productionBaseId_month: { colorId: input.colorId, productionBaseId: input.baseId, month: input.month } },
      select: { mode: true, revision: true, snapshotHash: true } }),
  ]);
  return resolveProductionMonth(input.month, facts, basis);
}
