# R26 Gate 3B API 与数据库组合证明

## 取证范围

- staging：`http://localhost:8080`
- 应用提交：`4f92e8d`
- 项目：`R26-G3B-UAT-进展提交-20260724-2136`
- 项目 ID：`cmryzlcre0001m9011z4277c5`
- 任务 ID：`cmryzlcs20006m901meo53q8v`
- 生产请求：0

## 实际 Gate 3B 写动作

| 动作 | 数量 | 任务状态未变 | 工作流未变 |
| --- | ---: | --- | --- |
| `R26_PROGRESS_DRAFT_SAVED` | 2 | true | true |
| `R26_PROGRESS_DRAFT_DELETED` | 1 | true | true |
| `R26_PROGRESS_SUBMITTED` | 1 | true | true |
| `R26_MATERIAL_UPLOADED` | 1 | true | true |
| `R26_MATERIAL_VERSION_UPLOADED` | 1 | true | true |

本轮没有 Gate 3B 发出的 complete、approve、reject、return、transition、fee、
monthly review 或 color exit 请求。

## 最终数据库快照

```text
project.currentNodeCode = PROJECT_INITIATION
workflow.currentNodeCode = PROJECT_INITIATION
task.status = READY
active task count = 1
formal progress count = 1
active draft count = 0
open blocker count = 1
current material count = 1
archived material version count = 1
```

材料 V2 为当前版本，V1 已归档但仍可通过受权限保护的历史内容接口读取。

## 最后一次部署后的 nginx 片段

```text
DELETE /api/v2/tasks/:taskId/progress-draft  1 × 200
GET    /api/v2/tasks/:taskId/progress-context 6 × 200
PUT    /api/v2/tasks/:taskId/progress-draft  1 × 200
```

应用修复部署会重建 nginx 容器并清空其短期访问日志，所以更早的材料上传和正式提交
请求不再存在于最终容器日志。对此采用产品负责人已接受的组合证明：

1. 操作前、上传、V1/V2、提交成功和跨页联动截图；
2. 真实浏览器交互帧回放；
3. 不可变进展记录、材料版本和审计动作的数据库快照；
4. 项目节点、任务状态和任务数量不变量；
5. 服务层与客户端自动化测试。

## 浏览器结果

```text
console error = 0
console warning = 0
page error = 0
production request = 0
complete/approve/reject/return/transition request = 0
```

## 不变量结论

正式进展、阻塞和材料版本已经持久化；任务仍为 `READY`，项目和工作流当前节点均为
`PROJECT_INITIATION`，活动任务仍为 1。Gate 3B 没有完成工序，也没有生成下一工序。
