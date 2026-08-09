# R26 颜色数据库完整模拟测试 Blocker Report

更新时间：2026-08-07 20:12:52 +08:00

> 解除说明：本报告保留最初两次自动化断言失败的历史。用户在停止后明确要求继续，修正断言后只执行了一次有界 Playwright 复核，最终 `1/1 PASS (5.2s)`。当前最终结果以 `R26_COLOR_DATABASE_SIMULATION_REPORT.md` 为准；本报告不再代表现存 blocker。

## 当前准确状态

```text
COLOR_DATABASE_BASELINE_ZERO_CONFIRMED
STEP05_CONTROLLED_NUMBERING_BUSINESS_PATH_VERIFIED_LOCALLY
THREE_CONTROLLED_COLOR_RECORDS_VISIBLE_IN_LOCAL_READ_MODEL
DUPLICATE_COLOR_CODE_REJECTED
MATERIAL_AND_AUDIT_PROVENANCE_VERIFIED
PLAYWRIGHT_GATE_PASSED_AFTER_EXPLICITLY_AUTHORIZED_BOUNDED_RERUN
LOCAL_BROWSER_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

## 失败环境与精确身份

- 环境：本机隔离模拟，不是公网 staging，不是 production。
- 用户页面：`http://localhost:8080/admin/color-database`。
- Web upstream：`http://localhost:3100`。
- 隔离 API：`http://localhost:3201/api`。
- PostgreSQL：`feishu_timeline`，本机端口 `15432`。
- 源码 HEAD：`2081c3920bb5c41578ef9c189477d05f392896ad`。
- 运行元数据：`runtimeCommit=unknown`、`release=development`，因此不得声明 `DEPLOYED`。
- production：未请求、未修改、未测试。

## 起始记录为 0 的原因

模拟前数据库有两条带编号的旧颜色，但两条都没有完整的第 05 步受控来源：

| 颜色 | 旧编号 | 第 05 步任务 | 操作人/时间 | 确认材料 | 严格结果 |
|---|---|---|---|---|---|
| 星云蓝 | `CLR-DEMO-A-001` | 无 | 无 | 无 | 排除 |
| 极昼银 | `CLR-DEMO-C-001` | 无 | 无 | 无 | 排除 |

颜色数据库只读取同时具备已完成 `COLOR_NUMBERING` 任务、`numberingTaskId`、操作人、时间和同任务确认材料的记录，所以产品页面显示 0 是正确结果，不是读取失败。

## 完整模拟后的结果

停止时本机隔离测试已成功完成两次第 05 步受控编号事务；获继续授权后的有界复核又完成第三次受控编号。最终颜色数据库展示三条合规记录，详见最终报告。

| 颜色编号 | 颜色/项目 | 第 05 步任务 | 确认材料 | 任务结果 |
|---|---|---|---|---|
| `R26-UAT-1786081484809-5E2149` | `UAT-R20-正常流程-深海蓝-20260807134443` | `cmsiisthv001dqr01hpik44h6` | `cmsiistz8001jqr01875asfn6` | COMPLETED |
| `R26-UAT-1786081988039-FBB59C` | `UAT-R20-正常流程-深海蓝-20260807135307` | `cmsij3m2g003xqr01u378sxah` | `cmsij3m9s0043qr015v00j0lb` | COMPLETED |

数据库复核结果：

- 颜色总行数：4；
- 严格受控记录：2；
- 颜色数据库可见记录：2；
- 两条记录均保存第 05 步任务、操作人、完成时间和确认材料；
- 两条第 05 步任务均为 `COMPLETED` 且不再 active；
- 两条完成动作均存在项目活动/审计记录；
- 两条旧自由编号仍被严格排除。

## 负向与唯一性验证

重复编号场景使用项目 `cmsij3mlw004hqr019af1vao9` 和第 05 步任务
`cmsij3mrk005gqr01xsox0h6` 再次提交
`R26-UAT-1786081988039-FBB59C`：

- 服务端拒绝重复编号；
- 任务保持 `READY` 和 active；
- 未创建新的颜色记录；
- 数据库中该编号仍只有一条；
- 已完成进展记录不等于工序完成。

## 浏览器真实操作结果

在精确本机 URL 完成：

- 颜色数据库显示 2 条受控颜色；
- 汇总显示材料 2、未完整 2、本月材料 2；
- 使用完整颜色编号搜索只命中目标记录；
- 无匹配查询显示明确空态；
- 点击“清除”恢复 2 条记录并清空输入；
- 1440px 截图已保存；
- 1024px 与 390px 实测无页面横向溢出、完整顶部导航可见；
- console error 0，page error 0。

1024px 与 390px 本轮只取得浏览器布局测量，没有成功保存对应截图，不能把布局测量表述为截图证据。

## 两次失败与停止原因

同一个 Playwright 门禁连续失败两次：

1. 第一次：业务事务已成功，数据库已正确写入；测试错误地断言扁平字段
   `numberingAttachmentId`，实际接口按契约返回 `confirmationAttachment.id`。
2. 第二次：重复编号已被服务端正确拒绝；测试正则
   `/已被使用|唯一|重复/` 未匹配实际提示
   `颜色编号“…”已被颜色“…”使用。` 中的插入文本。

根因是自动化断言与实际响应结构/中文提示不一致，不是颜色编号事务、唯一性校验、颜色数据库读取或浏览器交互失败。第二次后已把断言修正为可容纳插入文本的表达式，但按照 `AGENTS.md` “同一门禁连续失败两次后停止”的规则，不进行第三次盲目重跑。

## 已尝试方案与最终复核

- 已将附件断言改为读取 `confirmationAttachment.id`；
- 已将重复提示断言收敛为 `/已被.*使用|唯一|重复/`；
- 已用 API 单元测试、数据库查询和真实浏览器交互交叉证明业务结果；
- 用户随后明确要求继续；仅执行一次有界 Playwright 复核，结果 `1/1 PASS (5.2s)`。
- 最终数据库为 5 条颜色、3 条严格受控颜色、2 条旧记录继续排除。

## 技术检查

```text
API focused tests                         21/21 PASS
API build                                 PASS
Prisma validate                           PASS
Web typecheck                             PASS
Web build                                 PASS (33 pages)
目标 /admin/color-database Placeholder    0
仓库 Placeholder 原始扫描匹配             22（含测试与既有正式占位路由）
Playwright 完整门禁                        1/1 PASS (5.2s)
```

详细数据库、浏览器与自动化证据：

- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-database-evidence.json`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/03-color-database-two-controlled-1440.png`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/04-color-database-search-match-1440.png`

## 结论

此 blocker 已解除。最终本机颜色数据库从 0 变为 3 条严格受控记录，业务链路、数据库、材料、审计、唯一性拒绝、幂等、真实浏览器与 Playwright 均通过。production、main 和 tag 均未改变，产品负责人尚未确认本轮结果。
