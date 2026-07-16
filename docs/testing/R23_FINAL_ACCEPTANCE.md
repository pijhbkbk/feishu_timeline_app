# R23 Final Acceptance

## 1. 最终结论

R23E：`PASSED`。

R23：`PASSED / STOP BEFORE R24`。

最终 application/staging commit 均为 `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`。R23D 已在该提交上通过审计专项、`10 VU × 30m` 与 `5 VU × 2h`；R23E 未修改应用代码并补齐 API socket、E2E、Playwright、Gitleaks、真实 logout 和 Session store 删除，全部通过。evidence commit 创建并推送后，R23 正式关闭。

## 2. 精确提交

| 字段 | 值 |
|---|---|
| applicationCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| stagingCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| evidenceCommit | `075c25314dc30c53aa560fc0cf98fa6bf93aa49e` |
| branch | `release/r22-stability-security-rc` |

active API/Web 镜像 revision 均等于 staging commit；17 个 migration、0 pending；PostgreSQL、Redis、API、Web、Nginx healthy，restart 0。

## 3. 门禁状态

| 门禁 | 状态 |
|---|---|
| P0 = 0 | PASS |
| P1 未关闭 = 0 | PASS（累计 7/7 修复） |
| P2 未关闭 = 0 | PASS（累计 2/2 修复） |
| 有效已认证用户全权限 / 未登录 401 | PASS；用户策略取消九角色隔离，不宣称九角色隔离测试通过 |
| 七条真实 UAT 写路径 | PASS |
| 并发 409、幂等、无节点复活 | PASS |
| 中文附件名、同名不覆盖、V1→V2、中断无半记录 | PASS |
| 月度 12 条、1/12 保持第 17 步活跃、逾期同步 | PASS |
| 主链路 E2E | PASS |
| 完整 Playwright | PASS：52/52，0 skipped，5.1m |
| 单元测试 | PASS：Web 74/74、API 166/166 |
| lint / typecheck / 双端 build / Prisma validate | PASS |
| 20 VU × 5m 未认证只读参考 | PASS：5600 请求，0 error/5xx，p95 46.17 ms |
| 5 VU × 2h 最终提交真实认证耐久 | PASS：29,658 请求，0 error/auth/5xx，HTTP p95 80.758 ms |
| 10 VU × 30m 最终提交真实认证耐久 | PASS：17,997 请求，0 error/auth/5xx，HTTP p95 96.776 ms |
| final E2E | PASS，16.82s |
| Gitleaks current / history | PASS / PASS，0 findings |
| real OAuth logout / old Session / Redis record | HTTP 201 / rejected / deleted |

## 4. R23B 七条权威项目与清理（历史证据）

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

## 5. R23C blocker 与当时决策（已由 R23D/R23E 解除）

`R23-BLOCK-002` 已通过受控真实 OAuth 临时会话方式解除。当时 blocker 为 `R23C-BLOCK-004`：修复候选连续两次在外部 Docker Hub/npm registry 拉取阶段失败，未能部署到 staging。

解除后必须精确部署 `a4a9efd`，重跑修复后 `10 VU × 30m` 与完整回归。当前禁止进入 R24、生产部署、main 合并和 tag。

## 6. R23C 历史更新（2026-07-16）

当前结论仍为 `BLOCKED / NOT PASSED`，但原认证会话注入 blocker 已解除：真实 OAuth 会话完成了受控注入、logout 与临时材料销毁。

- `5 VU × 2 h`：PASS，32,539/32,539 checks，0 auth/5xx/restart/deadlock，read p95 736.946 ms。
- `10 VU × 30 m` 修复前：FAIL，7 次项目日志读取超时，read p95 1104.928 ms；0 auth/5xx。
- 产品缺陷 `R23C-P1-007` 已在 candidate `a4a9efd50404a512102dd74d1ab18d9bceb971a9` 修复，API 163/163、Web 74/74、lint/typecheck/build/Prisma validate 通过。
- 两次 staging 部署在产出镜像前分别被 Docker Hub `DeadlineExceeded` 与 npm registry `ECONNRESET` 阻断；active staging 仍为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`，五服务 healthy、重启 0。
- 修复后 10 VU 和最终完整回归均未执行；P1 closure 未经 staging 复测，故未关闭 P1 为 1。

恢复点和精确证据见 `docs/testing/R23C_BLOCKER_REPORT.md`。不得标记 R23 PASSED，不得进入 R24。

## 7. R23D 历史更新（2026-07-16）

| 门禁 | 结果 |
|---|---|
| final applicationCommit == stagingCommit | PASS：`d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| audit pagination special | PASS：23,189/23,189 unique，最大 48,714 bytes，p95 25.464 ms |
| 10 VU × 30m | PASS：17,997 请求，0 error/5xx/auth，HTTP p95 96.776 ms |
| 5 VU × 2h | PASS：29,658 请求，0 error/5xx/auth，HTTP p95 80.758 ms |
| P0 / 未关闭产品 P1 | `0 / 0` |
| lint / typecheck / builds / Prisma | PASS |
| Web unit | PASS `74/74` |
| API unit/security | 162 PASS；4 个 socket transport 用例被 `listen EPERM` 阻断，无断言失败 |
| final E2E | BLOCKED：tsx IPC `listen EPERM`，应用启动前停止 |
| final Playwright | BLOCKED：Docker API socket permission denied，基础设施启动前停止 |
| final Gitleaks | BLOCKED：native binary absent + Docker API unavailable |
| auth cleanup | 本地材料销毁 PASS；server logout 因 localhost `EPERM` 未确认 |
| evidence commit | BLOCKED：`.git/index.lock` 创建被 `EPERM` 拒绝 |

产品 P1 `R23C-P1-007` 已关闭。R23 的剩余问题是执行环境证据不完整，不是业务或耐久失败。按硬门禁仍为 `BLOCKED / NOT PASSED`，不允许进入 R24。恢复后不重跑两档耐久，只补跑上述受阻回归和 logout/Gitleaks，并提交当前工作树中的 R23D 证据。

方案 A 最小权限仍是 R24 前置项。当前未实施，因为在 R23 尚未关闭时改变应用代码会使已经完成的同 commit 耐久证据失效。

## 8. R23E 最终关闭（2026-07-16）

| 门禁 | 结果 |
|---|---|
| Git / Docker / localhost preflight | PASS |
| applicationCommit == stagingCommit | PASS：`d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| 应用代码冻结 | PASS：R23E 仅 docs evidence 变更 |
| 4 个被阻断 API socket tests | PASS；API 总计 166/166、0 skipped |
| E2E | PASS |
| Playwright | PASS：52/52、0 skipped、Chrome 148.0.7778.96 |
| formal-page console/page errors | `0 / 0` |
| logout / old Session / Session store | HTTP 201 / rejected / record deleted |
| auth material | destroyed；临时目录 0 |
| Gitleaks current/history | PASS/PASS；0 findings |
| P0/P1/P2/P3 open | `0/0/0/0` |
| evidenceCommit | `075c25314dc30c53aa560fc0cf98fa6bf93aa49e` |

R23D 耐久证据继续有效，因为 application/staging commit 未变且 R23E 没有应用、Prisma、部署或运行时配置改动。最终判定为 `R23E PASS / R23 PASSED / STOP BEFORE R24`。

当前已验收策略仍是所有有效认证用户完整权限、匿名/停用/锁定拒绝和业务状态门禁保留；不宣称九角色隔离通过。方案 A 最小权限是进入 R24 前必须实施并重新验证的新应用变更，本轮未实施。
