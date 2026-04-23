# R12 PostgreSQL 备份与恢复演练

## 1. 目标

- 明确生产 PostgreSQL 备份命令
- 明确恢复步骤
- 至少完成一次“备份文件生成 + 恢复演练流程验证”

## 2. 当前环境约束

- 生产数据库用户：`feishu_timeline_app`
- `rolcreatedb=false`
- 因当前账号没有 `createdb` 权限，本轮没有在生产机创建临时数据库
- 本轮采用“同库临时 schema 恢复演练”，不会覆盖 `public`

## 3. 本轮新增脚本

- 备份 / 演练脚本：[scripts/deploy/backup-postgres.sh](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/backup-postgres.sh)

## 4. 生产备份命令

```bash
bash scripts/deploy/backup-postgres.sh
```

脚本行为：

- 读取 `/opt/feishu_timeline_app/apps/api/.env.production`
- 去掉 `DATABASE_URL` 里的 `?schema=` 查询参数后执行 `pg_dump`
- 生成 custom dump 与 `sha256`
- 默认输出到 `/var/backups/feishu-timeline-db/<timestamp>/`

## 5. 恢复演练命令

```bash
bash scripts/deploy/backup-postgres.sh RUN_RESTORE_DRILL=yes
```

演练步骤：

1. 生成正式 custom dump
2. 用 `pg_restore --file` 转成 SQL
3. 将 `public` 重写为临时 schema
4. 在同一数据库中创建临时 schema
5. 回放恢复 SQL
6. 校验关键表数量和关键表行数
7. 删除临时 schema，确认无残留

## 6. 2026-04-23 实际演练结果

### 6.1 备份文件

- 备份目录：`/var/backups/feishu-timeline-db/20260423T081746Z`
- 备份文件：`/var/backups/feishu-timeline-db/20260423T081746Z/feishu-timeline.dump`
- 备份大小：`172K`
- 校验文件：`/var/backups/feishu-timeline-db/20260423T081746Z/feishu-timeline.dump.sha256`
- 恢复报告：`/var/backups/feishu-timeline-db/20260423T081746Z/restore-drill-report.txt`

### 6.2 恢复校验

- 临时 schema：`r12_restore_1776932266`
- `public_tables=38`
- `restore_tables=38`
- `public_users=3`
- `restore_users=3`
- `public_projects=0`
- `restore_projects=0`
- `public_audit_logs=0`
- `restore_audit_logs=0`
- `restore_status=ok`
- 事后复核：`r12_restore_%` 残留 schema 数量为 `0`

## 7. 恢复注意事项

- 不要在生产库 `public` 上直接回放备份
- 当前账号没有 `createdb` 权限，若要做“整库恢复”，需要 DBA 账号或改到 staging / 独立恢复库
- 演练过程中若脚本失败，会优先清理临时 schema，仍建议复核 `information_schema.schemata`
- 如需保留中间 SQL 文件用于审计，可执行：

```bash
bash scripts/deploy/backup-postgres.sh RUN_RESTORE_DRILL=yes KEEP_DRILL_ARTIFACTS=yes
```

## 8. 手工恢复建议

### 8.1 当前权限模型下

- 优先恢复到 staging 或独立临时库
- 若只能在生产机验证，继续使用临时 schema 方案，不要碰 `public`

### 8.2 若后续获得 `createdb` 权限

```bash
pg_restore --clean --if-exists --create --dbname <maintenance_db_url> /path/to/feishu-timeline.dump
```

完成恢复后再执行：

```bash
bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
bash scripts/deploy/ops-check.sh
```
