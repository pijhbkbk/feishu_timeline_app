# R26 累积产品与后台更新生产发布证据（2026-08-09）

## 1. 发布结论

- 运行代码提交：`535041bb25f21d548d863d07b35e3e952b0aeb2c`
- GitHub 分支：`main`
- GitHub 远端：`https://github.com/pijhbkbk/feishu_timeline_app.git`
- 生产地址：`https://timeline.all-too-well.com`
- 生产环境：GCE `instance-20260408-091840`，项目 `axial-acrobat-492709-r7`，区域 `us-west1-b`
- 生产代码目录：`/opt/feishu_timeline_app`
- 数据库：生产 PostgreSQL 数据库 `feishu_timeline`
- 发布方式：从已推送的不可变 `main` 提交进行 systemd 源码构建与发布，不使用容器镜像
- 准确状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / MAIN_MERGED / PRODUCTION_DEPLOYED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`

本报告对应的证据文档提交与运行代码提交分开保存。证据文档提交不会重新构建或替换生产运行代码；
证据提交的完整 hash 以包含本文件的 Git 提交和本轮最终报告为准。

## 2. Git 与运行版本一致性

| 项目 | 值 |
|---|---|
| 本地运行代码提交 | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| GitHub `origin/main`（发布时） | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| 生产服务器 HEAD | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| 生产服务器 `origin/main` | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| API `runtimeCommit` | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| Web `runtimeCommit` | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| buildTime | `2026-08-09T06:49:11Z` |
| release | `r26-admin-535041bb25f2` |

校验结果：`expectedCommit == API runtimeCommit == Web runtimeCommit == server HEAD ==
origin/main`。

## 3. 生产拓扑与切换时间

| 服务 | 运行方式 | 监听 / upstream | ActiveEnterTimestamp |
|---|---|---|---|
| Web | systemd | `127.0.0.1:3000` | `Sun 2026-08-09 06:52:05 UTC` |
| API | systemd | `127.0.0.1:3001` | `Sun 2026-08-09 06:52:00 UTC` |
| Nginx | systemd | Web `127.0.0.1:3000`；API `127.0.0.1:3001` | `Sun 2026-08-09 06:52:18 UTC` |
| PostgreSQL | systemd | 数据库 `feishu_timeline` | 发布后 active |
| Redis | systemd | 应用缓存 | 发布后 active |

本次为 systemd 源码构建部署，因此没有 Web/API 容器 image tag 或 digest。不可变运行身份由已推送
的完整 commit、buildTime、release、服务器 HEAD 与公开元数据共同证明。

## 4. 数据库备份、恢复验证与迁移

发布前备份：

- 服务器文件：`/var/backups/feishu-timeline-db/20260809T064545Z/feishu-timeline.dump`
- SHA-256：`622d5457603d620d11fc25a89c9513bb8b266345673224637f1d490f4468ed0b`
- 备份格式：PostgreSQL custom-format dump
- 恢复验证：已恢复到隔离 schema 并核对 46 张表；核心行数 users `12/12`、projects `1/1`、
  audit_logs `49/49`，随后清理隔离恢复 schema，未改生产业务数据。

生产迁移：

- `20260805143000_add_business_division_reference_data`
- `20260805213000_add_color_numbering_provenance`
- `20260806083000_add_project_marketing_unit_and_paint_supplier`

迁移复核：共发现 26 个 migration，Prisma 返回 `Database schema is up to date!`。

## 5. 发布前本地门禁

以下命令在运行代码提交产生前全部通过：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`：Web `193` tests；API `329` tests
- `pnpm --filter web build`
- `pnpm --filter api build`
- `pnpm --filter api prisma:validate`
- `git diff --check`
- 正式页面 Placeholder 扫描
- `pnpm security:secrets`

Placeholder 扫描原始命中 22 行；本轮更新的正式页面命中 0。历史正式 Placeholder 路由组仍为 4 个：
`/reviews`、`/settings`、`/colors`、`/projects/:projectId/:section`。

## 6. 精确生产域名验证

### 6.1 公共元数据与认证入口

- `GET https://timeline.all-too-well.com/api/health`：HTTP 200，API 运行元数据与预期提交一致。
- `GET https://timeline.all-too-well.com/build-info`：HTTP 200，Web 运行元数据与预期提交一致。
- `GET https://timeline.all-too-well.com/api/auth/feishu/start`：HTTP 302，跳转到中国区
  `https://accounts.feishu.cn/open-apis/authen/v1/index`。
- 回调地址：`https://timeline.all-too-well.com/login/callback`。
- OAuth state 使用独立 HttpOnly、Secure、SameSite=Lax Cookie，TTL 600 秒。

### 6.2 真实浏览器结果

已在真实浏览器打开 `https://timeline.all-too-well.com/`，确认未登录访问进入飞书中国区 OAuth。
内置验收浏览器当前账号属于 `测试企业 - 20250216`，该企业没有生产应用权限；切换团队后进入正式
飞书二维码登录页，但本轮没有获得正式团队的已认证业务会话。因此：

- 公共元数据、精确域名、Nginx、OAuth 发起链路：`PASS`
- 生产受保护页面的真实数据、写操作和保存后重读：`AWAITING_AUTHENTICATED_RECHECK`
- 产品负责人生产验收：`AWAITING_PRODUCT_OWNER_CONFIRMATION`

不得将上述认证会话限制解释为部署失败，也不得将公共链路通过冒充受保护业务页面产品验收通过。

## 7. 本轮已进入生产运行代码的主要更新

- 共享顶部导航始终位于页头，窄屏不再移动到底部。
- 共享页头移除无业务功能的搜索、通知和帮助图标；项目列表自身的真实搜索继续保留。
- 材料上传页移除 `Required`、`Upload`、`History` 等无意义英文标签。
- 项目、工序、组织、分工、角色权限、审计与颜色数据库的累积后台更新。
- 第 05 步颜色编号受控来源、唯一性与编号溯源字段。
- 新建项目的颜色营销单位与六项涂料供应商字段。
- 部门事业部参考数据及组织编辑收敛。
- 飞书 OAuth 多标签 state Cookie 隔离修复。

## 8. 未完成与人工验收边界

- 未建立或部署独立 staging；本轮 staging URL、runtime commit、用户路径均为“未执行”。
- 生产技术部署已完成，但正式团队已认证用户路径尚未由产品负责人逐页确认。
- 未创建新 tag；现有历史 tag 指针未改变。
- 未部署证据文档提交；生产继续运行代码提交 `535041bb25f21d548d863d07b35e3e952b0aeb2c`。
- 四个历史 Placeholder 路由组不在本轮更新范围，仍需单独产品决策。
