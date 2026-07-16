# R23 Final Acceptance

## 1. 最终结论

R23C：`BLOCKED / NOT PASSED`。

R23：`BLOCKED / NOT PASSED`。

当前应用 candidate 为 `a4a9efd50404a512102dd74d1ab18d9bceb971a9`，active staging 仍为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`。真实飞书单账号已完成七条 UAT 写路径与 `5 VU × 2h`；首次 `10 VU × 30m` 暴露项目日志无界响应，代码修复后被外部 registry 连续两次阻断部署和复测，因此不得将 R23 标为 PASSED。

## 2. 精确提交

| 字段 | 值 |
|---|---|
| applicationCommit candidate | `a4a9efd50404a512102dd74d1ab18d9bceb971a9` |
| evidenceCommit | 本次 R23C blocker 证据文档提交；完整 SHA 在最终输出中记录 |
| stagingCommit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |

active API/Web 镜像 revision 均等于 staging commit；17 个 migration、0 pending；PostgreSQL、Redis、API、Web、Nginx healthy，restart 0。

## 3. 门禁状态

| 门禁 | 状态 |
|---|---|
| P0 = 0 | PASS |
| P1 未关闭 = 0 | FAIL（累计 7，6 已关闭；R23C-P1-007 代码已修复但 staging 复测未完成） |
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
| 5 VU × 2h 真实认证耐久 | PASS：32,539 请求，0 error/auth/5xx，read p95 736.946 ms |
| 10 VU × 30m 真实认证耐久 | FAIL（修复前）/ BLOCKED（修复后未部署） |

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

`R23-BLOCK-002` 已通过受控真实 OAuth 临时会话方式解除。当前 blocker 为 `R23C-BLOCK-004`：修复候选连续两次在外部 Docker Hub/npm registry 拉取阶段失败，未能部署到 staging。

解除后必须精确部署 `a4a9efd`，重跑修复后 `10 VU × 30m` 与完整回归。当前禁止进入 R24、生产部署、main 合并和 tag。

## 6. R23C 更新（2026-07-16）

当前结论仍为 `BLOCKED / NOT PASSED`，但原认证会话注入 blocker 已解除：真实 OAuth 会话完成了受控注入、logout 与临时材料销毁。

- `5 VU × 2 h`：PASS，32,539/32,539 checks，0 auth/5xx/restart/deadlock，read p95 736.946 ms。
- `10 VU × 30 m` 修复前：FAIL，7 次项目日志读取超时，read p95 1104.928 ms；0 auth/5xx。
- 产品缺陷 `R23C-P1-007` 已在 candidate `a4a9efd50404a512102dd74d1ab18d9bceb971a9` 修复，API 163/163、Web 74/74、lint/typecheck/build/Prisma validate 通过。
- 两次 staging 部署在产出镜像前分别被 Docker Hub `DeadlineExceeded` 与 npm registry `ECONNRESET` 阻断；active staging 仍为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`，五服务 healthy、重启 0。
- 修复后 10 VU 和最终完整回归均未执行；P1 closure 未经 staging 复测，故未关闭 P1 为 1。

恢复点和精确证据见 `docs/testing/R23C_BLOCKER_REPORT.md`。不得标记 R23 PASSED，不得进入 R24。
