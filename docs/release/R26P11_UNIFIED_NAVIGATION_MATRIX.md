# R26P11 Unified Navigation Matrix

## Problem

The production application still rendered two page shells:

- V2 core routes used the approved “项目列表 / 系统管理” labels.
- Legacy business and administrator subpages used
  “项目管理 / 复盘分析”.

Their active-state implementations also differed, leaving project detail and
administrator child routes without a reliable highlighted parent item.

## Implementation

- Added one route classifier shared by both page shells.
- Normalized `/v2/*` and production short paths before matching.
- Renamed the shared top-level entries to:
  - 工作台
  - 项目列表
  - 我的任务
  - 进展提交
  - 系统管理
- Added prefix handling for all project, task, material, and administrator
  child routes.
- Updated both desktop and mobile shells.
- Updated legacy-shell active colors to the product brand blue.

## Automated Route Coverage

The matrix covers 20 route variants, including:

- V2 and production dashboard routes;
- project list, project workspace, and business child pages;
- task list and task filters;
- progress and material routes;
- administrator root, users, roles, audit, and V2 administrator routes.

```text
targeted route/navigation tests PASS (29)
full repository lint           PASS
full repository typecheck      PASS
full repository tests          PASS (Web 165 / API 294)
Web production build           PASS
API production build           PASS
Prisma schema validation       PASS
production deployment          PENDING
production route audit         PENDING
```
