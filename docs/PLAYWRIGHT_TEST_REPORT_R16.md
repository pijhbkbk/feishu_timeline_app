# PLAYWRIGHT_TEST_REPORT_R16.md

## 测试文件

- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-ui-chinese.spec.ts`
- `apps/web/tests/playwright/r16-create-project.spec.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`

## R16 专项结果

```bash
pnpm playwright:test -- --grep R16
```

结果：`6 passed (59.8s)`

覆盖：

- 中文 UI 页面可访问性和临时英文/占位文案检查。
- 真实新建项目表单、项目列表搜索、项目详情、时间线看板。
- 1→4 推进后第 5/6 步并行创建。
- 第 6 步完成后第 7/9/10 步并行创建。
- 第 9 步未完成时主线仍可推进到第 12 步。
- 第 12 步退回第 11 步并生成第 2 轮。
- 第 13 步固定金额 `10000` 元。
- 第 16 步后第 17 步生成 12 个月度评审卡片。
- 第 18 步年产量录入、退出阈值和系统建议。
- 材料提交平台真实文件上传。
- 数据中心页面可见并展示关键指标。

## 全量 Playwright 结果

```bash
pnpm playwright:test
```

结果：`13 passed (1.4m)`

全量覆盖 R16 新增 6 条用例，以及既有登录、项目创建、R14 驾驶舱、PPT UI 页面、评审退回、月度评审、颜色退出回归。

## 其他门禁命令

| 命令 | 结果 |
|---|---|
| `pnpm install` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过，Web 53 个测试、API 111 个测试 |
| `pnpm --filter @feishu-timeline/api prisma:validate` | 通过 |
| `pnpm --filter @feishu-timeline/api build` | 通过 |
| `pnpm --filter @feishu-timeline/web build` | 通过 |
| `pnpm test:e2e` | 通过 |
| `pnpm playwright:test -- --grep R16` | 通过 |
| `pnpm playwright:test` | 通过 |

## 中间失败与修复

| 分类 | 表现 | 处理 |
|---|---|---|
| P3 测试选择器 | 第 12 步退回后默认工序抽屉不一定选中第 2 轮 | 改为在工序表格验证第 2 轮 |
| P3 测试选择器 | 费用页标题实际为“开发费用 / 收费记录表单”，测试误找“颜色开发收费”标题 | 改为断言“收费记录表单”和固定金额提示 |
| P3 测试断言 | 个别文案严格匹配与真实页面结构不一致 | 调整为真实用户可见节点断言 |
| P2 UI 文案 | 导航和空状态仍出现“占位” | 改为正式中文业务描述 |

未发现 P0/P1 业务阻断问题。

## 证据产物

R16 截图输出目录：

- `apps/web/test-results/r16-screenshots/`

Playwright 失败追踪目录仅在失败时生成；最终全量回归无失败 trace。
