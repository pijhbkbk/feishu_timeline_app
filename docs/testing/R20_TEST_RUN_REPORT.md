# R20 Test Run Report

## 1. 测试环境

| 字段 | 值 |
|---|---|
| Round | `R20_REAL_WORLD_UAT_AUTOMATION` |
| 执行日期 | `2026-05-19` |
| 执行环境 | local |
| Web | Playwright runner 自动启动 `@feishu-timeline/web` |
| API | Playwright runner 自动启动 `@feishu-timeline/api` |
| 数据库 / Redis | 本地测试环境 |
| 被测版本 | `feat/real-world-uat-r20` 工作树；最终 commit 见 Git 记录 |
| 生产写入测试 | 未执行 |
| staging 测试 | 未执行，未提供 staging 地址 |

## 2. 测试账号与角色

本轮通过本地 `mock-login` 创建或复用测试身份，不记录明文密码。

| 角色 | 模拟账号前缀 | 权限角色 |
|---|---|---|
| 营销公司 | `r20_marketing` | `project_manager` |
| 涂装工艺部 | `r20_coating` | `process_engineer` |
| 采购部 | `r20_procurement` | `purchaser` |
| 质量管理部 | `r20_quality` | `quality_engineer` |
| 生产部 / 涂装厂 | `r20_production` | `process_engineer` |
| 财务部 | `r20_finance` | `finance` |
| 项目经理 | `r20_projectManager` | `project_manager` |
| 系统管理员 | `r20_admin` | `admin` |
| 普通查看者 | `r20_viewer` | `viewer` |
| 未登录用户 | 无 | 无 |

## 3. 测试项目

本轮自动化创建的项目均使用 `UAT-R20-` 前缀，实际项目名会追加时间戳。

| 基准项目 | 用途 | 本轮结果 |
|---|---|---|
| `UAT-R20-正常流程-深海蓝` | 标准流程、收费、月度评审、颜色退出、UI 证据 | PASS |
| `UAT-R20-评审退回-星河银` | 第 12 步退回和新轮次 | PASS |
| `UAT-R20-非阻塞测试-极光白` | 第 9 步非阻塞、第 4/6 步并行幂等 | PASS |
| `UAT-R20-逾期测试-赤霞红` | 逾期与数据中心统计 | PASS |
| `UAT-R20-权限材料-沙岩灰` | 材料上传、归档、下载和权限 | PASS |

## 4. 执行命令

```bash
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep @r20 --list
rm -rf test-results/r20 && pnpm playwright:test:r20
```

本轮收口已执行项目总门禁：

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
pnpm playwright:test:r20
```

## 5. 汇总结果

| 指标 | 数量 |
|---|---:|
| 用例总数 | 13 |
| 通过数 | 13 |
| 失败数 | 0 |
| 阻塞数 | 0 |
| P0 | 0 |
| P1 | 0 |
| P2 | 0，已修复 1 项移动端横向溢出 |
| P3 | 0 |

最终 R20 专项命令结果：

```text
13 passed (1.7m)
```

## 6. 证据产物

| 产物 | 数量 | 路径 |
|---|---:|---|
| 截图 | 33 | `test-results/r20/screenshots/` |
| API / 页面快照 | 8 | `test-results/r20/api-snapshots/` |
| 每用例记录 | 13 | `test-results/r20/exported-test-records/` |
| Trace 附件 / 截图附件 | 34 | `test-results/r20/traces/` |
| HTML 报告 | 1 | `test-results/r20/reports/playwright-report/` |

## 7. 场景结果

| Test ID | 场景 | 实际结果 | 结果 |
|---|---|---|---|
| R20-001 | 首页、导览和核心页面可用性 | 核心页面均可通过真实浏览器访问，健康接口 200，中文导航可见 | PASS |
| R20-002 | 新建颜色开发项目 | 通过真实项目表单创建 `UAT-R20-正常流程-深海蓝-*`，列表、详情、时间线可见 | PASS |
| R20-003 | 第 1-4 步主线推进 | 第 4 步后仅出现第 5 步和第 6 步 | PASS |
| R20-004 | 第 4/6 步并行幂等 | 重复完成不会重复生成；第 6 步后仅出现第 7、9、10 步 | PASS |
| R20-005 | 第 9 步非阻塞 | 第 9 步保持未完成时，主线仍进入第 12 步 | PASS |
| R20-006 | 第 12 步退回 | 必填原因生效；退回后生成第 11 步新轮次；第二轮通过后生成第 13、14 步 | PASS |
| R20-007 | 第 13 步固定 10000 元 | 页面和 API 校验保持 10000 元，且不阻塞第 14/15/16 步 | PASS |
| R20-008 | 第 17 步 12 个月度评审 | 第 16 步完成后，当前项目生成 12 个月度实例 | PASS |
| R20-009 | 第 18 步颜色退出 | 年产量 18 建议退出，25 建议保留，最终结论由人工确认 | PASS |
| R20-010 | 材料提交平台 | 材料可上传归档，元数据可见；无权限上传和未登录下载被拒绝 | PASS |
| R20-011 | 权限与越权 | 未登录、只读、采购、财务、质量边界符合预期；IDOR smoke 未发现越权 | PASS |
| R20-012 | 数据中心一致性 | 数据中心能反映 R20 项目、逾期、返工、月度评审和退出统计 | PASS |
| R20-013 | UI 中文化 / 交互 | 1440px、1920px、移动端截图通过；任务抽屉信息可见 | PASS |

## 8. 修复与复测摘要

| 问题 | 等级 | 修复 | 复测 |
|---|---|---|---|
| 第 18 步颜色退出测试缺少必填日期，导致用例无法提交 | P1 测试问题 | 补充退出日期和生效日期填写 | R20-009 PASS |
| 第 13 步后续主线推进使用财务身份审批第 14 步，角色不匹配 | P1 测试问题 | 财务校验后切回项目经理推进主线 | R20-007 PASS |
| 第 9 步非阻塞用例切换角色后使用不稳定用户名导致页面不可见 | P1 测试问题 | R20 mock 用户名改为角色维度稳定值 | R20-005 PASS |
| 移动端时间线存在横向溢出风险 | P2 产品问题 | 收紧时间线容器 `min-width`、`max-width` 和移动端布局 | R20-013 PASS |
| 月度评审全局断言在多个 UAT 项目并存时过严 | P2 测试问题 | 将断言限定到当前项目区块 | R20-008 PASS，全量 Playwright PASS |
| 权限用例将 `LOCAL_DEV` 同部门只读项目误判为 IDOR 风险 | P2 测试问题 | IDOR smoke 改为使用 seed 演示项目验证跨部门受限访问 | R20-011 PASS，全量 Playwright PASS |

## 9. 剩余风险

- 本轮完整写入测试仅在 local 执行，未覆盖 staging / 生产环境网络、域名、证书、Nginx、真实飞书入口。
- 测试账号为本地 mock-login，不代表飞书真实用户授权链路。
- `test-results/` 为本地证据目录，不提交到仓库；需交付时应由执行机器导出。

## 10. 最终结论

R20 本地真实浏览器自动化 UAT：`PASS`。

建议进入 staging 部署验证和业务人工验收，不建议跳过 staging 直接做生产写入测试。
