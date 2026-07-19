# R25A Historical Resume Blocker Report

## Historical stop

The first selector-resume run incorrectly required exactly one append-only
marker row. The second used immediate `locator.count()` and observed zero before
the filtered request completed. Neither failure proved a runtime defect, but the
round stopped under the bounded two-attempt rule.

## Final repair and resolution

The accepted assertion is retrying and count-tolerant:

```ts
await expect(matchingRows.first()).toBeVisible();
expect(await matchingRows.count()).toBeGreaterThan(0);
```

Target Playwright passed 3/3. Runtime `4aff07c...` was committed, deployed and
passed administrator/non-admin/management UAT, targeted security, both load
profiles, full regression, recovery rehearsals and final staging UAT.

Current status: `RESOLVED / R25-ADMIN-001_FIXED_RETEST_PASS`.
