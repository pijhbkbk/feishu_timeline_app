# R24 前方案 A 权限测试报告

## 验收对象

- application/staging：`f0de3dd85fee0d69a2f33ac0f32f600b2826207c`
- migration：`20260716160000_apply_plan_a_role_permissions`
- 环境：本地 mock 角色回归 + `http://localhost:8080` 真实飞书 OAuth staging

## 关键用例

| 用例 | 预期 | 结果 |
|---|---|---|
| 普通负责人提交/完成本人任务 | 允许 | PASS |
| 项目经理代办普通任务 | 允许 | PASS |
| 管理员仅凭角色代办普通任务 | 403 | PASS |
| 指定评审人操作本人评审记录 | 允许 | PASS |
| 其他评审人操作该记录 | 403 | PASS |
| 指定评审人经通用 workflow 接口旁路 | 403 | PASS |
| 项目经理执行第 12/17 步 | 允许 | PASS |
| 财务执行第 13 步 | 允许 | PASS |
| 项目经理仅凭角色执行第 13 步 | 403 | PASS |
| 管理员/项目经理执行第 18 步 | 允许 | PASS |
| 工艺工程师仅凭角色执行第 18 步 | 403 | PASS |
| 普通查看者创建项目 | 403，前端按钮 disabled | PASS |
| 财务查看角色后台/创建项目 | 403/403 | PASS |
| 管理员查看角色后台/项目日志 | 200/200 | PASS |
| 审计人员查看项目日志/创建项目 | 200/403 | PASS |
| 普通查看者读取项目日志 | 403 | PASS |
| 未登录读取项目列表 | 401 | PASS |
| 普通查看者下载已有材料 | 200 | PASS |
| 普通查看者上传材料 | 前端 disabled，后端无写权限 | PASS |

## 回归汇总

```text
Web unit:       78 / 78 PASS
API unit:      173 / 173 PASS
Playwright:     52 / 52 PASS
Lint:          PASS
Typecheck:     PASS
Web build:     PASS
API build:     PASS
Prisma:        PASS
Migration:     local + staging PASS
Image SCA:     API + Web PASS, 0 findings
Gitleaks:      current + history PASS, 0 findings
```

## staging 与真实账号

- 五个 compose 服务均 healthy，HTTP/static 检查无失败。
- 18 个 migration 已应用，0 pending。
- staging 数据库中的 `auditor` 权限为 `audit.read,dashboard.read,project.read`。
- staging 数据库中的 `project_manager` 包含 `review.execute`。
- 唯一真实飞书账号完成 OAuth，项目页、新建入口和项目审计日志正常；未创建新的业务测试数据。
- 真实账号是管理员正向证据；不同角色的拒绝边界来自自动化隔离身份，不宣称九个真实 OAuth 用户已验证。

结论：`PASS / READY_TO_STOP_BEFORE_R24`。
