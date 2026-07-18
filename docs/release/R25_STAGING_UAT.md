# R25 Final Staging User Acceptance

## Scope

- Environment: `http://localhost:8080`, isolated staging.
- Runtime application commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`.
- Authentication: one real Feishu staging account; no cookie, token, code or storage-state value is retained in evidence.
- Test data: only `R25-UAT-` prefixed projects and small legal test attachments.
- Browser evidence: Git-ignored `test-results/r25/uat/`, reviewed for authentication/sensitive content before retention.
- Account limitation: there is only one real account. Deterministic automated identities provide negative-role and IDOR evidence; this report does not claim nine real interactive accounts.

## Planned real-user paths

| Persona path | Required proof | Target | Result |
|---|---|---|---|
| Employee | Feishu login → workbench → locate task → submit progress → upload material → complete operation | locate ≤10 s; progress ≤60 s | NOT RUN; stopped at endurance gate |
| Project manager | project board → identify risk → project → stalled node → owner/blocker | risk ≤5 s; stalled node ≤2 clicks | NOT RUN; stopped at endurance gate |
| Administrator | `/admin` → audit logs → bounded search/detail | correct authorized access and stable paging | NOT RUN; stopped at endurance gate |
| Management | lifecycle retrospective → schedule variance/rework/material gaps/improvements | readable, persistent data | NOT RUN; stopped at endurance gate |

## Browser quality observations

The formal UAT will record page/console errors, failed network requests, persistent loading, horizontal overflow and disabled critical controls. Screenshots will exclude login callbacks, browser storage, developer tools and any credential-bearing material.

## Automated supporting coverage

The complete Playwright suite separately exercises the 18-step workflow, parallel branches, step 9/13 non-blocking rules, step 12 rework, fixed fee, recurring monthly records, upload validation/versioning, retrospective persistence, admin isolation, IDOR, mobile layouts and browser quality. Those deterministic identities supplement, but do not replace, the real OAuth UAT above.

## Final decision

NOT RUN because the prerequisite 5 VU endurance gate did not pass after two executions. R25 remains production-blocked; no interactive UAT result is claimed.
