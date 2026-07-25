# R26P 回滚记录

## 触发条件

Gate 8 真实飞书 OAuth 失败，命中 R26P 的强制回滚条件。

## 回滚操作

```text
ROLLBACK_REF=main
ROLLBACK_COMMIT=893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
RUN_PRISMA_MIGRATE_DEPLOY=no
RUN_SEED=no
```

使用仓库已演练的 GCE 正式部署脚本重新构建并恢复发布前 commit。三个新增 migration
均为向前兼容的加法迁移，因此保留数据库结构，不执行破坏性 down migration。

## 独立复核

```text
production_head=893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
production_branch=master
production_worktree=clean
feishu-timeline-api=active
feishu-timeline-web=active
nginx=active
postgresql=active
redis-server=active
public_api_health=ok
root_redirect=/dashboard
failed_systemd_units=0
nginx_config=valid
```

生产备份未用于回滚，因为没有数据损坏或计数异常；保留备份用于故障取证。

## Git 保护结果

```text
origin/main=893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
main_merge_commit=NOT_CREATED
candidate_tag=NOT_CREATED
stable_tag=NOT_CREATED
force_push=NOT_USED
```

V2 最新代码仍保留并已推送至 `origin/release/r26-v2-production`，等待修复飞书应用可用
范围后重新执行 Gate 8 及后续门禁。
