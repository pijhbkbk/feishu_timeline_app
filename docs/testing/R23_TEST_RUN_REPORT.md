# R23 Test Run Report

## 1. 候选与环境

| 字段 | 值 |
|---|---|
| 分支 | `release/r22-stability-security-rc` |
| 起始 commit | `7dd2243270c03399cd6da6cec41bf12eab68dd0b` |
| R23 被测应用 commit | 完成候选提交与 redeploy 后补录 |
| staging | `http://localhost:8080` |
| migration | 16 个 migration，0 pending |
| staging mock | Web/API 均关闭 |
| 测试窗口 | 2026-07-14 16:18 CST 开始 |

## 2. staging 验证

- 五个 staging 容器均 healthy。
- 初始 R22 镜像 tag `7dd2243270c0`，API/Web image ID 已记录在 `deploy/.state/current.env`。
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
- 认证后 `5 VU × 2h`、`10 VU × 30m` 与最终 `20 VU × 5m` 正式矩阵未完成。
- 因此当前运行结论为 `BLOCKED`，不是 `PASSED`。
