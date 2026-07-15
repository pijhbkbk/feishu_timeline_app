# R23 真实使用稳定性测试计划

## 1. 目标与边界

R23 在 `release/r22-stability-security-rc` 上验证当前 R22/R23 代码的真实业务可用性、并发一致性、异常恢复和耐久性。结论不得引用旧 R19/R20/R22 的历史执行结果；旧用例只能在当前代码上重新运行。

本轮允许修改候选分支、独立 staging 和本地测试数据；禁止合并 `main`、打 tag、部署生产或主动扫描生产。

## 2. 环境与隔离

| 项目 | 配置 |
|---|---|
| 候选分支 | `release/r22-stability-security-rc` |
| staging URL | `http://localhost:8080` |
| staging Compose | `feishu-timeline-staging` |
| PostgreSQL | 独立容器/卷，端口 `15432`，数据库 `feishu_timeline` |
| Redis | 独立容器/卷，端口 `16379` |
| 对象存储 | staging 独立 Docker volume |
| Session | staging 独立 secret，环境文件权限 `0600` |
| 飞书 | 预发布/测试应用，mock 登录关闭 |
| local 自动化 | `localhost:3000/3001`，独立本地 PostgreSQL/Redis，允许 mock 角色 |

staging、local 与 production 不共享数据库、Redis 或附件目录。账号密码、Session Cookie、飞书 secret 不写入仓库、报告或测试证据。

## 3. 访问策略（2026-07-14 修订）

| 身份状态 | 有效权限 | 核心预期 |
|---|---|---|
| 有效飞书 OAuth 用户 | 完整应用权限 | 可访问项目、流程、评审、附件、日志、待办和后台管理 |
| 有效 local mock 用户 | 完整应用权限 | 仅用于本地自动化，行为与已认证飞书用户一致 |
| 未登录 | 无业务权限 | 业务 API 返回 401，前端提示登录 |
| 停用或锁定用户 | 无业务权限 | 不建立有效业务会话 |

数据库中的八种系统角色和业务身份标签继续保留用于责任分工、展示、审计和未来策略调整，但不再产生允许/拒绝差异。最终验收只需由至少一个真实飞书 OAuth 用户覆盖全部功能，不再要求九个不同真实用户。

## 4. 业务项目

- `R23-UAT-正常主线-深海蓝`
- `R23-UAT-评审退回-星河银`
- `R23-UAT-非阻塞支线-极光白`
- `R23-UAT-逾期停滞-赤霞红`
- `R23-UAT-材料版本-沙岩灰`
- `R23-UAT-月度跟踪-冰川蓝`
- `R23-UAT-并发编辑-琥珀金`

自动化追加时间戳和唯一编号；测试结束后按 `R23-UAT-` 前缀归档或清理。

## 5. 执行阶段

1. 冻结候选分支并记录 commit、镜像、migration、测试窗口。
2. 在独立 staging 验证真实飞书 OAuth、mock 关闭和环境隔离。
3. 当前代码重新执行核心 18 步业务规则、已认证全权限路径和未登录边界。
4. 执行并发、陈旧数据、重复提交、断网/上传中断、401/403/500、刷新/后退、必交材料、换版、复盘、定时任务幂等。
5. 修复 P0/P1；每项先有失败证据与回归用例，再执行目标测试和全量回归。
6. 仅对 staging 温和执行 `5 VU × 2h`、`10 VU × 30m`、`20 VU × 5m` 只读负载。
7. 更新报告和执行账本；只有全部门禁通过才能结束 R23。

## 6. 性能门槛

| 指标 | 门槛 |
|---|---:|
| 普通查询 API p95 | `< 800 ms` |
| 普通写入 API p95 | `< 1500 ms` |
| 主要页面可交互 | `< 3 s` |
| 5xx | `< 1%` |
| 2 小时后 API+Web 内存增长 | `< 20%` |
| 重复任务、数据库死锁、容器重启 | `0` |
| unhandled rejection / uncaught exception | `0` |

## 7. 证据

- `test-results/r23/screenshots/`
- `test-results/r23/traces/`
- `test-results/r23/videos/`
- `test-results/r23/har/`
- `test-results/r23/api-snapshots/`
- `test-results/r23/performance/`
- `test-results/r23/logs/`

## 8. 停止条件

P0/P1 未关闭、已认证全权限或未登录边界未通过、2 小时耐久未完成、全量回归失败或证据 commit 不一致时，R23 必须为 `BLOCKED/FAIL`，不得进入 R24。

## R23B 收口执行结果（2026-07-15）

- 用户确认现行产品策略为“所有有效已认证用户完整权限”，九角色隔离矩阵因此不再适用；真实飞书账号 `李晓晨` 作为单一全权限账号执行全部人工写路径，未登录边界仍由后端拒绝。
- 最终 `applicationCommit` 与 `stagingCommit` 均为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`；API/Web 镜像 revision 与完整 SHA 一致，17 个 migration，0 pending，五项服务 healthy。
- 七条权威 `R23-UAT-*` 场景已通过真实页面完成；另有一条退回场景早期记录被权威项目替代。八条记录均通过名称和说明写入“已归档 / 测试项目”逻辑标记，未物理删除。
- 最终提交上 lint、typecheck、237 条单元测试、主链路 E2E、双端 build、Prisma validate、Playwright 52/52 均通过。
- `5 VU × 2h` 与 `10 VU × 30m` 仍因没有安全的认证会话注入方式而未执行。禁止读取或导出真实浏览器 Cookie、token、storageState，也不以 20 VU × 5m 未认证只读档替代认证耐久。

因此 R23B 与 R23 保持 `BLOCKED / NOT PASSED`，仅剩 `R23-BLOCK-002`，不得进入 R24。
