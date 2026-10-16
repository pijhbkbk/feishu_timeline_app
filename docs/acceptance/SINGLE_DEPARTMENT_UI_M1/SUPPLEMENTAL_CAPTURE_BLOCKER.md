# BLOCKER_REPORT — supplemental capture helper

Environment: isolated local http://127.0.0.1:3350. Runtime a0769e7808ace84a05a36bed6c0edc2e81d097c6.

Stopped after two capture-helper failures, before further execution. The completed immutable mainline browser suite remains 2 PASS.

1. /admin/color-database: helper selected main but the preserved legacy page contains nested main. Playwright correctly rejected an ambiguous locator.
2. /monthly-reviews: helper incorrectly required h1, while this existing route intentionally renders h2 “月度评审进度总览”.

Root cause: supplementary helper assumed a shared DOM structure for out-of-scope retained routes; it did not use their observed source contract. No business assertions or security tests failed in this helper.

Next plan: scope to the outer main, accept the actual semantic heading, independently retain API-status/console recording and page-load assertions. Do not change application markup merely for capture. User decision not required. Original logs preserved in var/m1-supplemental-browser*.log.
