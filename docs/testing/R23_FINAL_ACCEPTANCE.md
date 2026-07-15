# R23 Final Acceptance

## 1. 最终结论

R23B：`BLOCKED / NOT PASSED`。

R23：`BLOCKED / NOT PASSED`。

最终应用和 staging 均为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`。真实飞书单账号已完成七条 UAT 写路径；所有发现的 P1/P2 均关闭；最终完整回归通过。唯一未解除门禁是认证 `5 VU × 2h` 与 `10 VU × 30m`，因此不得将 R23 标为 PASSED。

## 2. 精确提交

| 字段 | 值 |
|---|---|
| applicationCommit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| evidenceCommit | 本次 R23B 证据文档提交；完整 SHA 在最终输出中记录 |
| stagingCommit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |

API/Web 镜像 revision 均等于完整 application commit；17 个 migration、0 pending；PostgreSQL、Redis、API、Web、Nginx healthy。

## 3. 门禁状态

| 门禁 | 状态 |
|---|---|
| P0 = 0 | PASS |
| P1 未关闭 = 0 | PASS（累计 6/6 修复） |
| P2 未关闭 = 0 | PASS（累计 2/2 修复） |
| 有效已认证用户全权限 / 未登录 401 | PASS；用户策略取消九角色隔离，不宣称九角色隔离测试通过 |
| 七条真实 UAT 写路径 | PASS |
| 并发 409、幂等、无节点复活 | PASS |
| 中文附件名、同名不覆盖、V1→V2、中断无半记录 | PASS |
| 月度 12 条、1/12 保持第 17 步活跃、逾期同步 | PASS |
| 主链路 E2E | PASS |
| 完整 Playwright | PASS：52/52，5.7m |
| 单元测试 | PASS：Web 74/74、API 163/163 |
| lint / typecheck / 双端 build / Prisma validate | PASS |
| 20 VU × 5m 未认证只读参考 | PASS：5600 请求，0 error/5xx，p95 46.17 ms |
| 5 VU × 2h 真实认证耐久 | BLOCKED / NOT RUN |
| 10 VU × 30m 真实认证耐久 | BLOCKED / NOT RUN |

## 4. 七条权威项目与清理

| 场景 | 项目 ID | 结果 / 清理 |
|---|---|---|
| 正常主线 | `cmrlhxjk00001n401qc1jk10q` | PASS / 已逻辑归档 |
| 评审退回 | `cmrllcv5q00crn401xwyb3d6f` | PASS / 已逻辑归档 |
| 非阻塞支线 | `cmrli33m7000zn401788108zo` | PASS / 已逻辑归档 |
| 逾期停滞 | `cmrli3gey001gn4013bniok62` | PASS / 已逻辑归档 |
| 材料版本 | `cmrli3jjq001xn401c6pjov7b` | PASS / 已逻辑归档 |
| 月度跟踪 | `cmrli3mo0002en401r82nwyh0` | PASS / 已逻辑归档 |
| 并发编辑 | `cmrli3pqi002vn401zld6zcfy` | PASS / 已逻辑归档 |

早期非权威退回项目 `cmrli1i8a000in401wpos12xy` 已标记为“已替代”并逻辑归档。系统没有独立 archive 字段，因此通过名称与说明写入“已归档 / 测试项目”，保留所有业务数据和审计，不物理删除。

## 5. 剩余 blocker 与决策

`R23-BLOCK-002` 仍为 OPEN：在禁止读取/导出 Cookie、token、OAuth code 或 storageState 的前提下，当前没有可供外部负载脚本安全注入的真实认证会话。一个真实账号足以满足当前全权限策略，但不能在不安全共享会话的情况下被宣称为 5/10 个独立认证用户。

解除后必须在同一最终应用 commit 或更新后重新回归的 commit 上完成两档认证耐久并满足阈值。当前禁止进入 R24、生产部署、main 合并和 tag。
