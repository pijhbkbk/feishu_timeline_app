# R26P9 Visual Spacing Cleanup

## Scope

This patch addresses three product-owner visual findings without changing
workflow data or the frozen flow topology:

1. the audit log workspace must use the standard V2 page gutters;
2. the project list must not show the explanatory question-and-answer hero;
3. steps 12 and 18 must keep their copy away from the SVG node borders.

## Implementation

- `AdminAuditWorkspaceR25A` now participates in the native `r26-page` frame,
  including its desktop, tablet, and mobile gutters.
- Both project-list rendering modes remove the explanatory hero. The create
  action remains available in a dedicated action row.
- Step 12 uses a tighter vertical content band around the center of its
  diamond.
- Step 18 uses terminal-specific horizontal and vertical text offsets.
- Node coordinates, dimensions, connectors, and workflow behavior remain
  unchanged.

## Local Validation

```text
targeted Web tests            PASS (11)
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 142 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
git diff --check              PASS
```

Production deployment and visual verification are recorded in
`docs/EXECUTION_LEDGER.md`.
