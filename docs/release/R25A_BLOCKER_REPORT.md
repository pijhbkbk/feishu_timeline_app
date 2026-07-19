# R25A Historical Blocker Report

## Historical stop

The first focused runtime-fix attempt stopped after two Playwright failures:
the local harness initially used the Web origin for mock-login API traffic, and
the next attempt expected navigation text `审计日志` while the product label was
`审计与异常`. Focused API 36/36 and Web 3/3 tests had already passed, but no
runtime commit or deployment was accepted at that stop.

## Resolution

The resumed implementation decoupled automation from product copy with stable
test IDs, href, roles and ARIA. The target Playwright gate later passed 3/3 and
the full release chain completed on runtime `4aff07c...`.

Current status: `RESOLVED / SUPERSEDED_BY_R25A_FINAL_GATE_REPORT`.
