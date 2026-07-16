# R23 Test Run Report

> 2026-07-15 最终补充：第 1～8 节保留历史候选轨迹；R23B 最终应用、staging、真实写路径与完整回归以第 9 节为准。

## 1. 候选与环境

| 字段 | 值 |
|---|---|
| 分支 | `release/r22-stability-security-rc` |
| 起始 commit | `7dd2243270c03399cd6da6cec41bf12eab68dd0b` |
| R23 被测应用 commit | `69d3332f30d6a7354c9b252d911cfe0a2652f76e` |
| staging | `http://localhost:8080` |
| migration | 16 个 migration，0 pending |
| API image | `feishu-timeline-api:69d3332f30d6` / `sha256:f6ae1bbce00760239d51e562a6b2cfafc9b525e5d54867520f8c411148c6ca34` |
| Web image | `feishu-timeline-web:69d3332f30d6` / `sha256:3cf96221cdb7568110b17e47891523196883fe989d95ac5efec01abdef643e7a` |
| staging mock | Web/API 均关闭 |
| 测试窗口 | 2026-07-14 16:18 ～ 17:12 CST |

## 2. staging 验证

- 五个 staging 容器均 healthy。
- 最终 R23 候选于 2026-07-14 17:02 CST 发布，五个 staging 服务和 HTTP 检查均 healthy。
- 运行 revision、API/Web 镜像 tag 与上述被测应用 commit 一致；工作树在构建时为 clean。
- 真实飞书 OAuth 扫码、回调和 `/projects` 页面成功。
- 真实成员仅发现 `李晓晨`，角色为 `admin + viewer`；未读取 Cookie、token 或密码。
- 未经用户动作确认，未在真实会话中提交七条 staging UAT 记录。

## 3. 自动化结果

| 套件 | 结果 |
|---|---:|
| R23 稳定性专项 | `14/14 PASS` |
| 当前版本核心业务重跑 | `13/13 PASS` |
| 主链路 E2E | PASS |
| 完整 Playwright | `50/50 PASS`，5.9m |
| Web 单元测试 | `73/73 PASS` |
| API 单元/安全测试 | `157/157 PASS` |
| Shared | 无测试用例 |

按 50 条浏览器回归加 6 项真实会话/性能门禁计，R23 验收用例共 56 项：52 通过、0 失败、4 阻塞；另有 230 条单元测试全部通过。阻塞项为真实九角色矩阵、七项目真实写路径、5 VU × 2h 和 10 VU × 30m 认证耐久。

## 4. 工程门禁

以下命令均通过：

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
PLAYWRIGHT_RESULT_ROUND=r23 pnpm playwright:test
pnpm playwright:test:r23
```

## 5. 数据一致性结果

- 并发流转仅一个写入成功，陈旧动作 409；完成节点不会复活。
- 相同进展幂等键只生成一条记录。
- 同名并发附件 storage key 唯一，无覆盖；中文原始名完整。
- 换版保留 V1 逻辑归档和 V2 关联。
- 缺必交材料时后端阻断，上传后才能推进。
- 重复第 16 步不会生成第二组月度实例。
- 连续两次评审退回保留两轮历史，仅一个后续活跃轮次。
- 重复提醒扫描在队列消费前也只入队一次。
- 上传中断无半条元数据，重试后仅一条有效记录。

## 6. 问题统计

| P0 | P1 | P2 | P3 |
|---:|---:|---:|---:|
| 0 | 3，全部修复 | 0 | 0 |

## 7. 未完成门禁

- 九类真实飞书角色矩阵未完成。
- staging 七类真实 UAT 项目尚未提交创建。
- 认证后 `5 VU × 2h`、`10 VU × 30m` 未完成。
- `20 VU × 5m` 只读档已完成：5600 请求、0 错误、0 非预期状态、0 个 5xx，p95 46.17 ms；详见性能报告。
- 因此当前运行结论为 `BLOCKED`，不是 `PASSED`。

## 8. 已认证全权限策略补充验证（2026-07-14）

| 字段 | 值 |
|---|---|
| applicationCommit | `dc0e0f8ec4b7061e23fc3f323c046534c15eef99` |
| 策略 | 所有有效已认证用户完整权限；未登录仍为 401 |
| 数据库 | 新建隔离库 `feishu_timeline_r23b_open_20260714`，16 个 migration 全部重新执行 |
| staging / production | 未部署，仍运行旧候选 |

验证结果：

- 定向 API 权限测试 `11/11 PASS`；Web R20 Playwright `13/13 PASS`。
- 主链路 E2E PASS；Web `73/73`、API `158/158`，lint、typecheck、双端 build、Prisma validate PASS。
- 普通查看者可见并进入后台管理；财务/查看者可创建项目和跨项目读取；未登录业务 API 返回 401。
- 新隔离库完整 Playwright 为 `43 PASS / 3 FAIL / 4 NOT RUN`。失败是两个 R22 用例依赖 seed 账号已有活跃任务，以及 R23-014 被后台调度提前消费；权限专项均通过。
- 按连续失败停止协议，不继续重跑，不部署 staging/production。九角色矩阵不再是门禁；当前 blocker 为测试夹具、七项目 staging 写入授权和认证耐久会话。

## 9. R23B 最终收口（2026-07-15）

### 9.1 精确版本与环境

| 字段 | 值 |
|---|---|
| applicationCommit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| evidenceCommit | 本次 R23B 文档证据提交；完整 SHA 在最终输出中记录 |
| stagingCommit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| API image | `feishu-timeline-api:cdb51963502e` / `sha256:82c8973e6e481a49f552f7ad8d2b458f3a1c768552ce8bed1866bc0b629fde7c` |
| Web image | `feishu-timeline-web:cdb51963502e` / `sha256:38e3f4bbb77262e6375a3e9e28268c02a3aa610875c096199466b020389ba73d` |
| migration / services | `17 / 0 pending`；PostgreSQL、Redis、API、Web、Nginx 全部 healthy |
| 身份 | 单一真实飞书账号；所有有效已认证用户完整权限；未读取/导出 Cookie、token 或 storageState |

### 9.2 七条权威 UAT 写路径

| 场景 | 项目 ID | 结果 |
|---|---|---|
| 正常主线 | `cmrlhxjk00001n401qc1jk10q` | PASS：进入第 18 步，节点触发关系与 12 月实例正确 |
| 评审退回 | `cmrllcv5q00crn401xwyb3d6f` | PASS：无原因拦截、退回、新轮次、第二轮通过与历史完整 |
| 非阻塞支线 | `cmrli33m7000zn401788108zo` | PASS：第 9 步未完成不阻塞主线 |
| 逾期停滞 | `cmrli3gey001gn4013bniok62` | PASS：逾期、停滞、风险、催办、统计一致 |
| 材料版本 | `cmrli3jjq001xn401c6pjov7b` | PASS：`定制颜色开发流程图.pdf` 中文原名、V1→V2、同名不覆盖、下载与匿名 401 |
| 月度跟踪 | `cmrli3mo0002en401r82nwyh0` | PASS：12 条不重复，首月 1/12，第 17 步仍活跃，第 18 步未触发，逾期投影正确 |
| 并发编辑 | `cmrli3pqi002vn401zld6zcfy` | PASS：同节点同时提交仅一条成功，另一条显示中文冲突；自动化确认 409 与幂等 |

原退回项目 `cmrli1i8a000in401wpos12xy` 因早期夹具状态不权威，被上述 replacement 项目替代并单独逻辑归档。运行清单位于被 Git 忽略的 `test-results/r23/r23-run-manifest.json`，不含敏感身份信息。

### 9.3 最终回归与缺陷

| 套件 | 最终结果 |
|---|---:|
| Web 单元测试 | `74/74 PASS` |
| API 单元/安全测试 | `163/163 PASS` |
| Shared | 无测试用例 |
| 主链路 E2E | PASS |
| 完整 Playwright | `52/52 PASS`，5.7m |
| lint / typecheck / Web build / API build / Prisma validate | 全部 PASS |

累计产品缺陷为 P0 0、P1 6（全部修复）、P2 2（全部修复）、P3 0。新增 P1 是试制流程可被通用动作绕过，以及月度评审首月即关闭/无法逐月完成；新增 P2 是任务材料中文原名显示和月度完成提示/重复按钮不准确。既有 `R23B-BLOCK-003` 测试夹具问题已修复，最终完整回归通过。

### 9.4 性能与最终判定

- 历史 20 VU × 5m 只读档：5600 请求、0 error、0 5xx，p50/p95/p99 `7.04/46.17/74.91 ms`，空闲回收后 API+Web 合计内存增长 4.87%，DB deadlock 0、服务重启 0。
- 该档位不是最终提交上的认证耐久，也不能替代 `5 VU × 2h` 或 `10 VU × 30m`。
- 唯一剩余阻塞 `R23-BLOCK-002`：在不读取/导出真实会话机密的约束下，没有安全的外部会话注入方式。两档认证耐久均未执行。

最终结论：`R23B BLOCKED / R23 NOT PASSED`。不得进入 R24、部署生产、合并 main 或创建 tag。

## 10. R23D staging artifact and endurance closure（2026-07-16）

### 10.1 Final artifact

| Field | Value |
|---|---|
| application/staging commit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| API image/digest | `r23d-d6d4962f88db` / `sha256:82ebedf96fcaf3edd2096eea2910cd0376b42734026a587f356052bde866d3bd` |
| Web image/digest | `r23d-d6d4962f88db` / `sha256:95d7aff3f653da9b1a63877ccebaa36b199fcba073fc38945662abd05142286b` |
| deployment | local cache overlay, `--network=none`, `--pull never`, `RUN_SEED=no` |
| migration/services | 17 / 0 pending；五服务 healthy；restart 0 |

### 10.2 Special and endurance

- Audit special PASS：23,189 total/traversed/unique，232 pages，最大 48,714 bytes，p95 25.464 ms，0 5xx/auth。
- 10m preflight PASS：1,050 requests，0 error/5xx/auth，HTTP p95 47.181 ms。
- 10 VU × 30m PASS：17,997 requests，0 error/5xx/auth，HTTP p50/p95/p99 `32.074/96.776/139.994 ms`，idle memory `-1.3618%`。
- 5 VU × 2h PASS：29,658 requests，0 error/5xx/auth，HTTP p50/p95/p99 `33.474/80.758/125.575 ms`，idle memory `-0.4664%`。
- 两档 DB slow/deadlock 0、Redis queue 0、restart 0、uncaught/unhandled 0、重复节点/周期任务/通知 0、附件半记录 0。

### 10.3 Final regression status

PASS：lint、typecheck、Web `74/74`、API 非 socket 测试 `162`、Web/API build、Prisma validate。

BLOCKED_BY_ENVIRONMENT：API socket transport 4 tests、E2E、Playwright、Gitleaks 和 server logout。统一根因是后续启用的受限沙箱拒绝 localhost bind/connect 或 Docker socket（`EPERM`）。本地 `/tmp/r23d-auth.*` 已销毁，没有认证值进入报告/Git。

最终结论：`R23D BLOCKED / R23 NOT PASSED / DO NOT ENTER R24`。产品 P0/P1 均为 0；恢复后只补跑受阻回归与 cleanup，不重跑耐久。详见 `docs/testing/R23D_DEPLOYMENT_RECOVERY.md`。

## 11. R23E unrestricted final regression and evidence closure（2026-07-16）

### 11.1 Version freeze

| Field | Value |
|---|---|
| applicationCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| stagingCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| evidenceCommit | `PENDING_EVIDENCE_COMMIT` |
| application changes in R23E | none; evidence documents only |

### 11.2 Final gates

| Suite | Result |
|---|---:|
| API unit/security/transport | `166/166 PASS`，51 files，0 skipped |
| previously blocked socket tests | `4/4 PASS`，actual localhost listener execution |
| Web unit | `74/74 PASS`，24 files |
| mainline E2E | PASS，16.82s |
| complete Playwright | `52/52 PASS`，0 skipped，5.1m |
| browser | Playwright 1.60.0 / Chrome for Testing 148.0.7778.96 |
| console / page errors on formal-page quality matrix | `0 / 0` |
| lint / typecheck / Web build / API build / Prisma validate | all PASS |
| Gitleaks current tree / full history | `PASS / PASS`，0 findings |
| real OAuth logout | HTTP 201; old Session rejected; Redis record deleted |
| auth material | destroyed; no auth temp directory or tracked auth file |

The initial browser run did not execute product tests because the locked Playwright Chromium binary was missing. After installing Chrome for Testing 148.0.7778.96 in the user cache, the unchanged full suite passed. This is an environment repair, not a product defect.

### 11.3 Final decision

P0/P1/P2/P3 open counts are `0/0/0/0`. The R23D endurance and audit evidence remains valid because application/staging stayed on the exact final commit and R23E introduced no application change. `R23D-BLOCK-005` is resolved.

Final conclusion: `R23E PASS / R23 PASSED / STOP BEFORE R24`. Production deployment, main merge, tag and R24 were not performed. Plan A minimum permission remains the mandatory next application change before R24.
