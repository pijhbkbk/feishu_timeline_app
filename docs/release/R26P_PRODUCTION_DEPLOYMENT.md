# R26P 生产部署记录

## 发布尝试

- 生产 URL：`https://timeline.all-too-well.com`
- 发布窗口：2026-07-24 23:28Z 至 23:45Z
- runtime commit：`ef6ba4379a4fd9a64eeeabd91160b86d89d59a01`
- 发布前 commit：`893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1`
- `RUN_SEED=no`
- 数据库命令：仅 `prisma migrate deploy`

候选版本部署时仅应用以下三个待处理 migration：

```text
20260724110000_add_r26_gate3a_member_assignments
20260724133000_add_r26_gate3b_progress_materials
20260724222000_add_r26_gate3c1_completion
```

部署期间没有复制 staging 数据，没有运行 seed，没有执行 reset 或强制 db push。

## 部署后技术验证

```text
PRODUCTION_RUNTIME_COMMIT=ef6ba4379a4fd9a64eeeabd91160b86d89d59a01
feishu-timeline-api=active
feishu-timeline-web=active
nginx=active
postgresql=active
redis-server=active
nginx_config=valid
postgresql=loopback
redis=loopback
api_local=ok
api_public=ok
AUTH_MOCK_ENABLED=false
UI_VERSION=v2
NEXT_PUBLIC_UI_VERSION=v2
NEXT_PUBLIC_UI_DATA_MODE=real
V1_FALLBACK_ENABLED=true
```

正式 V2 路由和 `/legacy/*` 回滚入口在未登录状态下完成技术验证。以上结果不能替代
Gate 8 的真实 OAuth 和业务 smoke。

## 最终状态

Gate 8 OAuth 失败后按门禁回滚。生产当前不再运行该候选 commit；详见
`R26P_ROLLBACK_RECORD.md`。
