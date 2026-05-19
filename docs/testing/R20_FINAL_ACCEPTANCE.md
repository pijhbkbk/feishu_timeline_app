# R20 Final Acceptance

## 1. 结论

R20 本地真实业务场景自动化 UAT 结论：`PASS`。

该结论表示本地自动化测试已通过核心流程、关键规则、材料、权限、数据中心和 UI 可用性检查。由于本轮未拿到 staging 地址，也未使用真实飞书企业自建应用入口，后续进入公司私有云或生产前仍需完成 staging / Feishu smoke 与业务人工验收。

## 2. 必须验证的关键规则

| 关键规则 | 结果 |
|---|---|
| 第 4 步完成后自动并行创建第 5 步和第 6 步 | PASS |
| 第 6 步完成后自动并行创建第 7 步、第 9 步和第 10 步 | PASS |
| 第 9 步涂料性能试验独立进行，不阻塞主线 | PASS |
| 第 12 步不通过退回第 11 步并生成新轮次 | PASS |
| 第 12 步通过后自动并行创建第 13 步和第 14 步 | PASS |
| 第 13 步颜色开发收费固定金额 10000 元 | PASS |
| 第 13 步不阻塞主线 | PASS |
| 第 16 步批量生产完成后生成第 17 步 12 个月度评审实例 | PASS |
| 第 18 步人工录入年产量，系统给出退出建议，最终结论人工确认 | PASS |

## 3. 业务场景覆盖

| 场景 | 结果 |
|---|---|
| 首页、导览页、工作台、项目、材料、月度评审、数据中心可用性 | PASS |
| 新建颜色开发项目 | PASS |
| 第 1 步到第 4 步主线推进 | PASS |
| 第 4 步、第 6 步并行节点创建幂等 | PASS |
| 第 9 步非阻塞主线 | PASS |
| 第 12 步评审不通过和第二轮通过 | PASS |
| 第 13 步固定收费 | PASS |
| 第 14 到第 16 步推进 | PASS |
| 第 17 步月度评审实例 | PASS |
| 第 18 步颜色退出治理 | PASS |
| 材料提交平台 | PASS |
| 权限与 IDOR smoke | PASS |
| 数据中心一致性 | PASS |
| UI 中文化、状态颜色、抽屉和移动端基本可读性 | PASS |

## 4. 测试数据

| 基准项目 | 结果 |
|---|---|
| `UAT-R20-正常流程-深海蓝` | PASS |
| `UAT-R20-评审退回-星河银` | PASS |
| `UAT-R20-非阻塞测试-极光白` | PASS |
| `UAT-R20-逾期测试-赤霞红` | PASS |
| `UAT-R20-权限材料-沙岩灰` | PASS |

## 5. 执行结果

| 指标 | 值 |
|---|---:|
| R20 用例总数 | 13 |
| 通过 | 13 |
| 失败 | 0 |
| 阻塞 | 0 |
| P0 未关闭 | 0 |
| P1 未关闭 | 0 |
| P2 未关闭 | 0 |

R20 专项命令：

```bash
pnpm playwright:test:r20
```

结果：

```text
13 passed (1.7m)
```

## 6. 报告与证据

| 文档 / 证据 | 路径 |
|---|---|
| 测试计划 | `docs/testing/R20_REAL_WORLD_UAT_PLAN.md` |
| 测试用例 | `docs/testing/R20_TEST_CASES.md` |
| 测试运行报告 | `docs/testing/R20_TEST_RUN_REPORT.md` |
| 问题与修复 | `docs/testing/R20_ISSUES_AND_FIXES.md` |
| 最终验收 | `docs/testing/R20_FINAL_ACCEPTANCE.md` |
| 截图证据 | `test-results/r20/screenshots/` |
| API / 页面快照 | `test-results/r20/api-snapshots/` |
| 每用例结构化记录 | `test-results/r20/exported-test-records/` |
| Trace 附件 | `test-results/r20/traces/` |

## 7. 上线前仍需确认

- staging 地址和账号是否可用。
- 是否需要将 `UAT-R20-` 项目在 staging 重跑并由业务确认。
- 飞书企业自建应用入口、redirect URL、可用范围和通讯录范围是否已按 R19 安全要求配置。
- 公司私有云主机、域名、证书、Nginx、数据库、Redis 和备份策略是否已按 R19 安全要求复核。

## 8. 下一步建议

建议进入下一轮 staging 部署验证和业务人工验收；不建议跳过 staging 直接在生产环境执行写入型 UAT。
