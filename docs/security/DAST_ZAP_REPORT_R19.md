# DAST ZAP Report R19B

Generated: 2026-07-10T09:22:02Z
Commit: 63f9be6
Target: http://host.docker.internal:3300
Image: `ghcr.io/zaproxy/zaproxy:stable@sha256:8d387b1a63e3425beef4846e39719f5af2a787753af2d8b6558c6257d7a577a2`
Result: **PASS_WITH_TRIAGED_LOW_INFO**

## Evaluation

The machine-readable report contains only Low/Info alerts; no Critical/High/Medium alerts were accepted.

# ZAP Risk Evaluation

Result: PASS_WITH_TRIAGED_LOW_INFO
Critical: 0
High: 0
Medium: 0
Low: 1
Info: 7
Blocking findings: 0

## Findings

- LOW 10044 Big Redirect Detected (Potential Sensitive Information Leak) (site: http://host.docker.internal:3300)
- INFO 10094 Base64 Disclosure (site: http://host.docker.internal:3300)
- INFO 10109 Modern Web Application (site: http://host.docker.internal:3300)
- INFO 10049 Non-Storable Content (site: http://host.docker.internal:3300)
- INFO 90005 Sec-Fetch-Dest Header is Missing (site: http://host.docker.internal:3300)
- INFO 90005 Sec-Fetch-Mode Header is Missing (site: http://host.docker.internal:3300)
- INFO 90005 Sec-Fetch-Site Header is Missing (site: http://host.docker.internal:3300)
- INFO 90005 Sec-Fetch-User Header is Missing (site: http://host.docker.internal:3300)

## Report files

- `/Users/lixiaochen/Downloads/feishu_timeline_app/reports/security/zap/zap-baseline.log`
- `/Users/lixiaochen/Downloads/feishu_timeline_app/reports/security/zap/zap-baseline.json`
- `/Users/lixiaochen/Downloads/feishu_timeline_app/reports/security/zap/zap-baseline.html`

## Gate policy

- Critical, High, or Medium alerts block the gate.
- Reports containing only Low/Info alerts are explicitly recorded as `PASS_WITH_TRIAGED_LOW_INFO`.
- Docker/ZAP execution failures, missing artifacts, invalid JSON, and invalid schemas fail closed.
- Active scan is not enabled. Remote targets require explicit authorization.
