# 受控恢复材料校验与隔离演练

`scripts/migration/verify-restore-inputs.mjs` 只准备小型、已审阅、合成恢复资料。
它不连接数据库、不执行 SQL、不读取环境文件、不安装或激活发布控制器。现有
staging/production/legacy restore 禁用入口继续保持原状。

## 使用边界

- 输入目录和输出父目录必须由可信执行人控制，验证期间没有并发写者；不得以 root
  运行，也不得将此工具作为处理恶意目录树的特权边界。
- manifest 的预期 SHA-256 必须从独立固定的审阅记录传入，不从待验文件临时计算后
  当作批准。本地测试中的合成资料由测试本身创建，摘要只是测试夹具。
- custom dump 的 `PGDMP` 标记仅是格式检查；校验和正确、catalog 可读都不能证明
  SQL 安全。未知来源备份不得据此送入真实数据库。
- 上限是 dump 64 MiB、单对象 20 MiB、500 个对象、合计 256 MiB、目录条目 1024。
  更大真实备份需要另行设计流式恢复及运行资源范围，不直接放宽这些限制。
- 校验成功才返回新建的私有快照路径。消费快照而不是再次读取原目录；失败时删除
  本次新建的不完整快照。执行人应在演练结束后清理自己创建的快照。

## 材料格式

目录只包含 `restore-manifest.json`、`database.dump` 以及清单列出的 `objects/` 文件。
版本 1 manifest 为 `{version, database, objects}`；database 与每个 object 均严格为
`{path, size, sha256}`。database.path 固定为 `database.dump`，object.path 必须位于
`objects/`，size 为真实字节数，sha256 为小写 64 位摘要。拒绝未知字段、重复对象路径、
路径穿越、链接、特殊文件和未列入清单的文件。这里的格式只描述演练材料，不替代
现有 release/runtime manifest 或 Finding Ledger。

```bash
node scripts/migration/verify-restore-inputs.mjs \
  /absolute/trusted/bundle "$REVIEWED_MANIFEST_SHA256" /absolute/private/snapshots
node --test scripts/migration/tests/verify-restore-inputs.test.mjs
```

真实隔离演练必须显式提供已有 PostgreSQL 镜像的精确本地 image ID：

```bash
RESTORE_TEST_POSTGRES_IMAGE="$VERIFIED_LOCAL_POSTGRES_IMAGE_ID" \
  node scripts/migration/tests/restore-snapshot.integration.mjs
```

演练拒绝 tag 和隐式镜像下载。它创建独立随机命名容器，使用 `--network none`、
只读根文件系统、非 root postgres 用户、cap-drop、内存/PID 上限和临时文件系统；
不发布端口、不挂载宿主目录、不接受真实数据库 URL 或已有容器 ID。只创建合成
项目、审计与附件，比较恢复后的完整行、对象摘要和外键拒绝。还验证篡改材料、
损坏 catalog 与非空目标不会被当成可恢复输入。结束后只清理自己创建的资源。

这不覆盖生产快照一致性、历史附件扫描状态、通知队列重放、RPO/RTO、权限重建、
生产规模或外部受信恢复控制器。上线前应在指定隔离环境补齐这些适用项。

## Reviews 索引的部署选择

当前 Prisma migration
`20260814120000_add_review_records_project_type_id_index` 使用普通 `CREATE INDEX`，
定义与 schema 一致，禁止修改其历史 SQL。普通建索引会阻塞写入；是否采用维护窗口
须依据目标数据量和窗口确定，不能用合成小库耗时替代。

维护窗口路径：暂停相关写入，验证数据库/对象备份及恢复路径，先检查当前 migration
和索引状态；由受信执行入口对迁移会话设置经实测有效的锁等待和语句超时，再执行
原 Prisma 迁移。迁移后检查 checksum、finished/failed 状态、`indisvalid`、索引列顺序、
只读与受控写入，最后恢复业务。失败不盲目重试或自动修改 `_prisma_migrations`。

如目标不能接受写入窗口，应单独批准 `CREATE INDEX CONCURRENTLY` 的操作和 Prisma
状态衔接，核对是否留下 invalid index；不要用 `IF NOT EXISTS` 把同名错误索引当作成功，
不要在事务块内运行 concurrent index。只有真实索引已经正确建立并验明后，才考虑
通过 Prisma 官方 resolve 流程登记对应迁移；不得未经核验标记为 applied。

依据：[PostgreSQL 16 CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html)。
此处是待环境明确后的操作预案，不是已执行的生产迁移或维护窗口批准。
