# R23 Test Run Report

> 2026-07-14 补充：本报告第 1～7 节记录 `69d3332` 历史候选。用户随后取消角色隔离，改为“所有有效已认证用户拥有完整权限”；最新候选和回归结果见第 8 节。

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
