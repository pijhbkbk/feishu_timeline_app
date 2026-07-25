# R26P 发布清单

## 结论

```text
R26P=FAIL
STATE=ROLLED_BACK
```

R26 V2 候选版本完成了源码、测试、安全快检、不可变 staging 构建、生产备份和
生产部署，但在 Gate 8 真实飞书 OAuth 冒烟中被飞书授权页明确拒绝。按照发布门禁，
已回滚生产，未合并 `main`，未创建候选或稳定标签。

## 源码与分支

| 项目 | 值 |
| --- | --- |
| source branch | `codex/r26-gate3c2-c3-d-full-lifecycle` |
| source commit | `85a6267494b5ef4fc259ee836d52e7fc44f732a1` |
| release branch | `release/r26-v2-production` |
| runtime commit | `ef6ba4379a4fd9a64eeeabd91160b86d89d59a01` |
| production before | `893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1` |
| production attempted | `ef6ba4379a4fd9a64eeeabd91160b86d89d59a01` |
| production after rollback | `893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1` |
| `origin/main` | `893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1` |
| main merge commit | not created |
| candidate tag | not created |
| evidence commit | `5088ded4c8e81af610efd4747e859765e894ab9c` |

## 构建来源

| 项目 | 值 |
| --- | --- |
| repository | `https://github.com/pijhbkbk/feishu_timeline_app.git` |
| release version | `r26p-ef6ba43` |
| OCI created | `2026-07-24T23:20:11Z` |
| pnpm lock SHA256 | `897bec6a0bf51a3f004ca9c5261606d01f756f50388d926649143ce6a570d9ec` |
| Prisma schema SHA256 | `9c7399593c61bfe1553759fc33b2f74bc5bb92ea0420d36c0b07186fbffe828d` |
| API Dockerfile SHA256 | `17380e1e7de0255eae6ecb8f5ce56e8f3db12e9313378ff6affabac2a87cc7bf` |
| Web Dockerfile SHA256 | `c74f8bf2cac4c7a6d72666ea0cf360505392561628a69ba1ba291a0c3a9aab6f` |
| migration directories | 21 |

## 不可变构建

| 组件 | 标识 |
| --- | --- |
| API | `feishu-timeline-api:r26p-ef6ba43` / `sha256:c30e739d56e83f3d359d10f40be1668a3847b572aabe8ffddee3f2c29f5d87e4` |
| Web | `feishu-timeline-web:r26p-ef6ba43` / `sha256:eacb8f2e54e6934797898d08e38a23d53c42febc0a76db2803dc74ba453ce1b6` |
| PostgreSQL | `sha256:47ec30ace1d6ebd45fda6e62b9119aa8a731493e5faf274f9f5dbfead77a803a` |

## 候选正式路由

`/dashboard`、`/projects`、`/projects/:projectId`、`/tasks`、`/progress`、
`/materials`、`/projects/:projectId/retrospective`、`/admin` 和
`/admin/audit-logs` 在候选版本中映射到 V2；`/v2/*` 保留兼容别名，
`/legacy/*` 保留 V1 回滚入口。

回滚完成后，生产正式入口已恢复为发布前版本；V2 候选代码仍安全保留在远端
release 分支。
