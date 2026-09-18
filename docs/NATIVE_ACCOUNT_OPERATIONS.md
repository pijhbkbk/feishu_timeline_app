# 原生账号运行与迁移

本阶段目标是 `https://timeline.all-too-well.com`。Google 仅承载基础设施；注册、密码登录与业务操作不再依赖 Google、飞书或其他身份提供方。同一固定源码版本同步交付不含真实业务数据的离线软件包；受保护业务备份与秘密单独保管。实际进度见 `EXECUTION_LEDGER.md`，本文不是部署完成证明。

## 用户与管理员

- `/login` 提供工号密码登录、注册和一次性恢复码重置；旧 `/login/callback` 引导返回账号登录。
- 正常登录按后端真实权限进入 `/dashboard`；无正式角色的普通原生用户进入 `/pending-access` 查看待分配状态、选择采购/工艺岗位意向。岗位意向不直接授予角色、部门或项目范围。系统管理员身份不被岗位申请覆盖。
- `/account` 仅显示姓名、工号、正式角色和组织；主动进入 `/account/security` 才显示修改密码。登录/注册/恢复表单最大 440px，账号安全最大 480px，手机保留至少 16px 两侧空间；不改变业务工作区宽度。
- 显式同源返回地址须符合目标路由权限；项目深链先由真实后端读权限确认。正常登录不默认跳转资料或安全页，不以岗位登记状态强制改密。
- `/admin/accounts`（V2 对应 `/v2/admin/accounts`）仅供系统管理员查询账号和签发一次性恢复码。恢复码只显示一次、30 分钟有效；数据库仅保存摘要；签发会立即撤销目标原密码和全部会话。
- `/admin/organization` 沿用已有的角色、部门和项目成员配置，仍须预览、确认、版本与幂等检查。配置变更撤销用户旧会话。改角色权限继续沿用后端权限矩阵。
- 用户可见登录标识统一称为“工号”，内部仍使用兼容的 `username/loginName` 字符串字段，保留旧登录标识与前导零。按小写和首尾空白归一化；3–64 位 ASCII 字母、数字、点、下划线或连字符，首字符须为字母/数字。管理员更改原生账号工号时同事务同步登录名；不凭工号认领已有账号或自动授予角色、部门、项目权限。
- 新设密码为 8–128 个 Unicode 字符且不超过 512 字节，不截断、不去首尾空格、不静默归一化；拒绝控制字符和本地常见弱口令。Argon2id 使用 64 MiB、3 次、1 路，独立随机盐；限制同时执行的昂贵密码运算。
- 2026-09-18 所有者调整产品密码策略为最低 8 个字符；这不宣称符合 NIST 单因素密码至少 15 字符的要求。不新增复杂字符组合要求，登录仍验证原有密码，不用新设规则拒绝已有凭据。

## 身份保留与主机操作

新增 migration `20260912190000_native_accounts` 保留 User.id、旧飞书标识和全部业务外键；旧标识仅用于历史，不按姓名、邮箱或手机号自动合并账号。已有用户不会自动获得密码。旧 OAuth/mock 会话不能作为生产原生会话使用。

管理员初始化没有 HTTP 入口。首次使用受保护的主机 CLI，以既有启用系统管理员的**准确内部 ID**建立凭据；确实没有既有管理员时才新建。单次初始化标记和管理员变更锁防止竞争接管。禁止通过生产 seed 初始化身份或覆盖真实数据。

运行已构建 API 制品内的命令：

```text
node dist/cli/native-account.js initialize --username <工号> --name <显示名> --user-id <既有管理员内部ID>
node dist/cli/native-account.js bind --user-id <准确内部用户ID> --username <工号>
```

密码从交互终端双次隐藏输入；自动化操作可附加 `--password-file <受保护文件>`。文件须由进程用户持有、权限 0600 或更严格、独立普通文件、非符号链接，8–512 字节；文件读取后仍执行统一 8–128 字符密码策略。不在命令行、环境变量、报告或聊天中传递密码。`bind` 不改变角色/部门/历史 ID，会撤销旧会话和恢复码。最后一个可登录系统管理员不能被网页恢复入口或账号停用/降权操作锁出；本人改密与经授权的主机恢复保留。

## 已有账号的受控管理员修正

仅在所有者明确授权且内部用户、凭据及历史关系已核实后，主机 root 可执行：

```text
node dist/cli/native-account.js grant-administrator --grant-file /run/protected/grant.json
```

维护文件须由 root 持有、权限 0600、独立普通文件，包含唯一 `maintenanceId`（UUID v4）、准确 `userId`、规范化 `expectedLoginName`、`expectedName`、`expectedUpdatedAt`、`expectedAuthVersion`、`expectedIsSystemAdmin`、完整 `expectedRoleIds` 和授权原因 `reason`。先只读核对这些预期值；不在源码、软件包或公开日志中存储真实维护文件。

该操作没有 HTTP 入口；不按姓名/工号搜索后自动选择账号，不创建用户或角色，不更改密码、恢复状态、岗位申请和历史业务。事务中锁定管理员变更、登录名和准确用户，只在身份、版本与角色集均一致时赋予现有启用的 admin 角色和系统管理员标记，定向递增授权版本使该用户旧会话失效。审计 `NATIVE_HOST_ADMIN_GRANTED` 标明主机维护、原因、维护 UUID、计划摘要和前后授权状态；不伪造其他用户为操作者。

同一计划重放返回原审计，不重复授予；若后续权限已被撤销，也不会重新提权。管理员关系属于正常数据库备份内容。恢复已有系统时先恢复业务数据和身份，不重新 seed、初始化或覆盖管理员；新装空库初始化是另一个操作。软件包只包含通用维护能力，不带真实账号计划或每套新装的预设管理员。

## 生产配置与发布顺序

1. 从干净、已提交的固定 full SHA 构建；保存 source tree、lockfile、Web/API 制品身份。远端使用本人服务器的私有接收库，禁止把本次源码自动推送至公开仓库。
2. 只读核对实际站点、宿主服务、数据库迁移与附件存储位置；保存现有版本、配置引用和回滚入口。只对本应用做一致备份，并在隔离环境实际恢复验证。备份和凭据不进入 Git/报告。
3. 应用新增迁移前检查历史迁移漂移。只执行尚未应用且已验证的 Prisma migrations；不得绕过 migration 手改生产表，不删除历史审计或附件。
4. `AUTH_MOCK_ENABLED=false`；生产 `FRONTEND_URL=https://timeline.all-too-well.com`。新版本无需 `FEISHU_APP_ID/SECRET/REDIRECT_URI`，它们即使遗留也不会激活身份适配器。保留数据库/Redis 强凭据、扫描器、配额、Origin、Cookie、HTTPS 和构建身份校验。
5. Web 维持现有正式 V2/真实数据构建配置；账号管理 V2 路由也须验证。身份迁移不允许改变到静态预览模式。变更 `NEXT_PUBLIC_*` 后须重新构建。
6. 在本人主机保护环境内完成准确旧管理员绑定，再切换本应用服务。旧会话会失效，用户需使用新账号密码登录。
7. 精确域名验证新构建、原生登录、刷新、退出、角色和项目范围负向、账号管理、受控业务写入与审计；保留截图、网络、控制台及版本证据。health 200 和本机 PASS 不代表生产交付或产品负责人确认。

历史部署脚本中的强制飞书 302/feishuEnabled=true 断言不再适用。新合同是未登录 session 返回 localEnabled=true、feishuEnabled=false、mockEnabled=false；原生登录建立安全 Cookie；旧 `GET /api/auth/feishu/start`、`GET /api/auth/feishu/login-url`、`POST /api/auth/feishu/callback` 返回 410 且不重定向。不得为迁就旧断言启用飞书或 mock。旧脚本中其他仍适用的安全验证保留；禁止绕过已停用的特权发布控制器。

## 验证入口

- `native-password.service.spec.ts`：真实 Argon2、盐、字符与资源边界。
- `native-auth.rate-limit.spec.ts`：个人拒绝不挤占全站额度；普通用户不消耗管理员预算。
- `native-auth.postgres.integration.spec.ts`：独立 PostgreSQL 上初始化/注册/恢复竞争、会话版本、岗位意向、最后可登录管理员、签发与撤销行锁。
- `scripts/testing/native-auth-http-test.mjs`：只允许本机隔离 API；真实 HTTP Origin、输入白名单、会话、改密、权限及旧入口负向。
- `scripts/testing/native-auth-migration-test.mjs`：只操作指定带测试用途标签的容器，用基线 schema 的合成关系验证实际迁移和迁移前后备份恢复。

公共认证例外仅为 `GET /api/auth/session`、`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/recover`、`POST /api/auth/logout`；既有 mock 路由生产拒绝，旧飞书路由仅返回停用状态。所有写入口（含公共认证）仍受同源 Origin 约束。账号目录、岗位、改密与管理员恢复签发不是公共例外。复核责任：本项目原生认证实施/独立审查；复核日期 2026-09-12。
