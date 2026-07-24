# R26 Gate 3C1 API、数据库与审计组合证明

## 取证范围

- staging：`http://localhost:8080`
- 真实飞书用户：李晓晨
- UAT 时间：2026-07-24
- production 请求：0
- fixture / seed 命中：0

## Gate 3C1 业务写请求

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| POST | `/api/v2/tasks/:taskId/completion-preview` | 只计算，不写任务或流程状态 |
| POST | `/api/v2/tasks/:taskId/complete` | 普通工序完成与自动推进 |
| POST | `/api/v2/tasks/:taskId/blockers/:blockerId/resolve` | 解除开放阻塞 |

客户端白名单拒绝 approve、reject、return、fee、monthly-review、color-exit、
transition 和成员写入。第 12/13/17/18 步专项业务写请求为 0。

## 串行项目最终任务快照

项目：`G3C1-SERIAL-20260724-2301`

```text
01 PROJECT_INITIATION          COMPLETED primary=true  active=false
02 DEVELOPMENT_REPORT          COMPLETED primary=true  active=false
03 PAINT_DEVELOPMENT           COMPLETED primary=true  active=false
04 SAMPLE_COLOR_CONFIRMATION   APPROVED  primary=true  active=false
05 COLOR_NUMBERING             READY     primary=false active=true
06 PAINT_PROCUREMENT           COMPLETED primary=true  active=false
07 STANDARD_BOARD_PRODUCTION   READY     primary=false active=true
09 PERFORMANCE_TEST            READY     primary=false active=true
10 FIRST_UNIT_PRODUCTION_PLAN  COMPLETED primary=true  active=false
11 TRIAL_PRODUCTION            COMPLETED primary=true  active=false
12 CAB_REVIEW                  READY     primary=true  active=true
```

数据库没有第 8 步任务，也没有第 13 步及以后任务。第 9 步仍为活动未完成支线，
项目主线已到 `CAB_REVIEW`，证明它不阻塞第 10→11→12。

完成命令与审计：

```text
R26_ORDINARY_TASK_COMPLETED command rows = 7
R26_ORDINARY_TASK_COMPLETED audit rows   = 7
WORKFLOW_COMPLETE audit rows             = 6
WORKFLOW_APPROVE audit rows              = 1
workflow.commandVersion                  = 8
project.currentNodeCode                  = CAB_REVIEW
```

第 4 步完成后数据库只新增第 5、6 步；第 6 步完成后只新增第 7、9、10 步。
新任务的负责人和责任部门取自服务端 Gate 3A 分配结果，没有前端负责人字段。

## 材料与阻塞

第 5 步缺少必交材料“颜色编号确认单”时，completion preview 返回准确缺失项并拒绝
完成。

阻塞项目：`G3C1-NONBLOCK-20260724-2301`

```text
progress action       = R26_PROGRESS_SUBMITTED
blocker description   = 等待供应商确认交付时间
blocker status        = RESOLVED
resolution summary    = 供应商已确认交付时间，项目管理部完成复核
actualResolvedAt      = present
resolvedBy            = 李晓晨
audit action          = R26_TASK_BLOCKER_RESOLVED
task status changed   = false
workflow transitioned = false
```

开放阻塞期间完成按钮不可提交；解除后同一面板局部刷新为可完成。

## 并发与幂等

项目：`G3C1-CONCURRENT-20260724-2301`

两个标签使用同一 `taskVersion` 同时提交：

```text
winner response                 = success
loser response                  = 409 CONCURRENT_TASK_COMPLETION
PROJECT_INITIATION task rows    = 1 COMPLETED
DEVELOPMENT_REPORT task rows    = 1 READY
completion command rows         = 1
distinct idempotency key rows   = 1
completion audit rows           = 1
```

数据库没有重复第 2 步任务，也没有第二次状态转换。

## 审计摘要

所有 Gate 3C1 完成记录使用中文可读摘要：

```text
完成工序 <工序名称>，系统已按冻结拓扑推进。
解除 <工序名称> 的阻塞：<阻塞说明>
```

审计 metadata 同时记录 `gate=R26_GATE3C1`、`requestId`、
`idempotencyKey`、完成原因和后果确认；阻塞记录保存实际解除时间、解决说明、
操作人和 requestId。

## 组合证据说明

产品负责人此前已接受临时提权与组合证据。当前结论由以下证据交叉得到：

1. 真实飞书 OAuth 用户在 staging 的实际点击与截图；
2. 完成前检查、成功、材料阻断、阻塞解除和并发 409 的浏览器帧；
3. `r26_command_requests` 幂等记录；
4. `workflow_tasks`、`workflow_instances` 和 `projects` 最终快照；
5. `audit_logs` 不可变审计事实；
6. 服务端、客户端和冻结拓扑自动化测试。

本轮未连接、访问或部署 production。

