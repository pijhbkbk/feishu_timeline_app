# R25 Known Issues and Residual Observations

## Release-blocking findings

None. P0/P1/P2/P3 are `0/0/0/0`.

| ID | Previous severity | Final status |
|---|---:|---|
| `R25-ADMIN-001` | P1 | **Fixed / Retest PASS** on runtime `4aff07c...`; bounded list/detail, stable filters/sort, admin UAT and non-admin denial all passed. |
| `R25-GATE-001` | evidence gate | Resolved; final warmed two-hour recovery memory growth `+7.8548%`, below 20%. |
| `R25-GATE-002` | evidence gate | Resolved; uninterrupted two-hour authenticated profile completed with a valid summary. |

## Non-blocking observations

- The initial backup catalog check needed container stdin; fixed and retested in
  `c7e9a2a`.
- The initial rollback state swap omitted provenance fields; fixed and retested
  in `c7e9a2a`.
- Earlier R24 ZAP Low/Info heuristic observations remain historical. The R25A
  authenticated audit-route smoke returned Critical/High/Medium/Low/Info
  `0/0/0/0/0`.
- Only one real Feishu account was available for interactive positive UAT.
  Deterministic identities supplemented negative roles and IDOR.

These observations do not authorize production. Product-owner approval,
production backup/rollback readiness and an explicit R25B deployment decision
are still required.
