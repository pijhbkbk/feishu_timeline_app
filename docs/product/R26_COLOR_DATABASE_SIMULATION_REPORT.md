# R26 颜色数据库完整模拟测试报告

更新时间：2026-08-07 20:12:52 +08:00

## 结论

颜色数据库起始记录为 0 是正确业务结果：数据库当时虽然有 2 条旧颜色，但它们没有第 05 步任务、操作人、时间和确认材料来源，必须排除。

本机隔离模拟完成后，数据库共有 5 条颜色，其中：

- 3 条具备完整第 05 步受控编号来源，颜色数据库可见；
- 2 条旧自由编号来源不完整，继续排除；
- 重复编号被服务端拒绝，没有创建第四条受控颜色；
- Playwright 最终 `1/1 PASS`，API 定向测试 `21/21 PASS`；
- production、main、tag 均未改变，产品负责人尚未确认本轮结果。

## 环境身份

```text
environment       local-isolated-simulation
exact URL         http://localhost:8080/admin/color-database
web upstream      http://localhost:3100
api upstream      http://localhost:3201/api
database          PostgreSQL feishu_timeline @ localhost:15432
source HEAD       2081c3920bb5c41578ef9c189477d05f392896ad
runtimeCommit     unknown
release           development
production        unchanged
```

由于本机运行元数据仍为 `runtimeCommit=unknown`，本报告只证明本机业务与浏览器路径，不构成 staging 或 production 部署证明。

## 起始数据

| 颜色 | 旧编号 | 第 05 步任务 | 操作人/时间 | 确认材料 | 颜色数据库结果 |
|---|---|---|---|---|---|
| 星云蓝 | `CLR-DEMO-A-001` | 无 | 无 | 无 | 排除 |
| 极昼银 | `CLR-DEMO-C-001` | 无 | 无 | 无 | 排除 |

严格读模型只接受同时具有已完成 `COLOR_NUMBERING` 任务、`numberingTaskId`、操作人、时间以及同任务“颜色编号确认单”的记录。因此初始页面显示 0 不是读取故障。

## 最终受控颜色

| 颜色编号 | 项目 | 第 05 步任务 | 操作人 | 确认材料 | 结果 |
|---|---|---|---|---|---|
| `R26-UAT-1786081484809-5E2149` | `R20-20260807134443-CE4D39` | `cmsiisthv001dqr01hpik44h6` | R20 系统管理员 | `cmsiistz8001jqr01875asfn6` | COMPLETED |
| `R26-UAT-1786081988039-FBB59C` | `R20-20260807135307-A95AF5` | `cmsij3m2g003xqr01u378sxah` | R20 系统管理员 | `cmsij3m9s0043qr015v00j0lb` | COMPLETED |
| `R26-UAT-1786104170349-6B17A8` | `R20-20260807200249-70880F` | `cmsiwb1zq008eqr010klfe939` | R20 系统管理员 | `cmsiwb27f008kqr0184cxtxe0` | COMPLETED |

最终数据库计数：

```text
颜色总行数                    5
严格受控颜色                  3
颜色数据库可见记录            3
来源不完整的旧记录            2
确认材料                      3
第 05 步完成审计              3
重复编号新增受控行            0
```

## 负向、幂等与审计验证

- 重复项目 `R20-20260807200250-C63F43` 尝试提交 `R26-UAT-1786104170349-6B17A8`，服务端返回“编号已被另一颜色使用”；
- 重复任务保持 `READY / active`，没有被错误完成；
- 数据库中该编号仍只有一条；
- 相同幂等键重放返回同一结果，没有重复创建颜色、任务或审计；
- 第三条成功记录存在 `R26_ORDINARY_TASK_COMPLETED`、`WORKFLOW_COMPLETE` 和 `ATTACHMENT_UPLOADED` 证据；
- 完成审计记录 requestId 与 Idempotency-Key 均为 `r26-color-ae93b395-6d52-41cb-be09-9a8ab1132ed5`。

## 浏览器与响应式结果

- 精确 URL：`http://localhost:8080/admin/color-database`；
- 完整编号搜索命中目标记录；
- 无匹配查询显示明确空态；
- 清除搜索恢复完整记录；
- 1440px 已保存两张真实截图；截图拍摄时页面有 2 条记录；
- 最终第三条记录由通过的 Playwright、API 回读和数据库查询共同证明，未伪称存在第三条记录的截图；
- 1024px 与 390px 实测无横向溢出且完整导航可见，但未保存截图；
- console error 0，page error 0。

## 技术门禁

```text
API focused tests                         21/21 PASS
API build                                 PASS
Prisma validate                           PASS
Web typecheck                             PASS
Web build                                 PASS (33 pages)
Playwright color database simulation      1/1 PASS (5.2s)
目标 /admin/color-database Placeholder    0
仓库 Placeholder 原始扫描匹配             22
```

前两次 Playwright 失败均为测试断言与实际响应结构/中文提示不一致，业务写入与拒绝结果正确。遵守两次失败停止后，用户明确要求继续，才在修正断言后执行一次有界复核；本次 `1/1 PASS`。

## 证据

- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-api-simulation.json`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-database-evidence.json`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/03-color-database-two-controlled-1440.png`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/04-color-database-search-match-1440.png`

## 当前状态

```text
COLOR_DATABASE_BASELINE_ZERO_CONFIRMED
STEP05_CONTROLLED_NUMBERING_BUSINESS_PATH_VERIFIED_LOCALLY
THREE_CONTROLLED_COLOR_RECORDS_VISIBLE_IN_LOCAL_READ_MODEL
DUPLICATE_COLOR_CODE_REJECTED
IDEMPOTENCY_VERIFIED
MATERIAL_AND_AUDIT_PROVENANCE_VERIFIED
PLAYWRIGHT_GATE_PASSED
LOCAL_BROWSER_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
