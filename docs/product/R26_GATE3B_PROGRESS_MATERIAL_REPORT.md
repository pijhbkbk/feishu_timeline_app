# R26 Gate 3B 进展提交与材料上传报告

## 结论

Gate 3B 已在独立 staging 实现并完成真实飞书用户 UAT，当前等待产品负责人确认。

```text
R26_GATE3B_IMPLEMENTED
PROGRESS_DRAFT_AND_SUBMISSION_ENABLED_ON_STAGING
TASK_MATERIAL_UPLOAD_AND_VERSIONING_ENABLED_ON_STAGING
WORKFLOW_TRANSITION_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3B_CONFIRMATION
STOP_BEFORE_GATE3C
```

本轮没有部署 production、合并 `main`、创建 tag、修改 V1，且没有开放完成工序、
评审通过/退回、收费确认、月度评审或颜色退出决定。

## 基线与部署

| 项目 | 值 |
| --- | --- |
| Gate 3A 产品批准提交 | `e52c9d0` |
| Gate 3B 分支 | `codex/r26-gate3b-progress-materials` |
| staging 应用提交 | `4f92e8d` |
| staging 镜像 tag | `r26-gate3b-4f92e8d` |
| staging URL | `http://localhost:8080` |
| 真实飞书用户 | 李晓晨 |
| UAT 项目 | `R26-G3B-UAT-进展提交-20260724-2136` |
| UAT 项目 ID | `cmryzlcre0001m9011z4277c5` |
| UAT 任务 ID | `cmryzlcs20006m901meo53q8v` |
| migration | 20 已应用，0 待执行 |
| 容器 | PostgreSQL、Redis、API、Web、nginx 全部 healthy |

部署前 staging PostgreSQL 备份：

```text
var/backups/r26-gate3b/r26-gate3b-predeploy-20260724-213428.dump
size: 4.6 MB
sha256: b07a9c96c179b8d472606fc8f2f16e2fec0df8448ca81e13537ee4bc0412e22f
```

## 已实现能力

### 草稿

- 每名用户、每个任务最多一份活动草稿；
- 支持保存、刷新恢复和手动删除；
- 使用 `draftVersion` 做乐观锁，陈旧版本返回 409；
- 草稿仅作者可编辑，不进入正式项目活动流；
- 正式提交成功后清理服务端草稿；
- 浏览器本地输入与服务端草稿分开处理；空本地草稿自动清除，有意义的本地输入才提示恢复。

### 正式进展与阻塞

- 三步表单自动带出项目、工序、当前用户、负责人和截止时间；
- 正式进展提交后不可覆盖，修正必须新增记录；
- `BLOCKED` 时服务端校验阻塞类型、说明、协助人员/部门、预计解除时间和影响程度；
- 阻塞摘要同步到工作台、项目卡、流程节点、工序详情、最近动态和项目记录；
- 所有动作由后端 `availableActions` 裁决，不按姓名或前端角色文案推断权限；
- `WORK_COMPLETE_PENDING_TASK_COMPLETION` 只表示本次工作已完成，不映射为
  `WorkflowTask.COMPLETED`。

提交响应显式返回：

```json
{
  "progressSubmitted": true,
  "taskStatusChanged": false,
  "workflowTransitioned": false
}
```

### 材料

- 复用既有附件存储和安全校验；
- 支持 PDF、PNG、JPG、DOCX、XLSX；
- 保留扩展名、MIME、文件魔数、大小、双扩展名、路径穿越、文件名 XSS 和权限校验；
- 上传中断不产生半条元数据；
- 替换材料创建 V2，V1 只读保留，不覆盖旧版本；
- 当前和历史版本均绑定 `projectId`、`taskId` 和材料类型；
- 历史下载响应包含 `nosniff`、私有禁缓存、同源和 sandbox 安全响应头。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v2/tasks/:taskId/progress-context` | 当前任务、权限、草稿、材料要求和历史上下文 |
| GET | `/api/v2/tasks/:taskId/progress-history` | 正式进展和材料版本历史 |
| PUT | `/api/v2/tasks/:taskId/progress-draft` | 保存本人草稿 |
| DELETE | `/api/v2/tasks/:taskId/progress-draft` | 删除本人草稿 |
| POST | `/api/v2/tasks/:taskId/progress-updates` | 提交不可变正式进展 |
| POST | `/api/v2/tasks/:taskId/materials` | 上传材料 V1 |
| POST | `/api/v2/tasks/:taskId/materials/:attachmentId/versions` | 替换并创建新版本 |
| GET | `/api/v2/tasks/:taskId/materials/:attachmentId/content` | 查看或下载当前/历史版本 |

所有 Gate 3B 写请求均要求 `Idempotency-Key`，并在服务端执行项目/任务访问校验、
DTO 枚举与长度校验、版本冲突处理、事务和审计。

## 真实 staging UAT

李晓晨通过真实飞书 OAuth 完成：

1. 从当前任务进入同一套三步进展表单；
2. 填写本次完成内容和下一步计划；
3. 选择“等待确认”，指定李晓晨和项目管理部协助；
4. 设置预计解除时间和“可能导致延期”；
5. 通过安全文件选择器上传 PDF V1；
6. 替换为 PDF V2，并查看 V1/V2 历史；
7. 提交正式进展；
8. 检查工作台、项目列表、流程地图、工序详情和项目记录同步；
9. 另行完成草稿保存、刷新恢复和删除；
10. 在 1024 与 390 检查抽屉、全屏 sheet、输入焦点和固定底部主动作。

浏览器最终观测：

```text
console error = 0
console warning = 0
page error = 0
production request = 0
complete/approve/reject/return/transition request = 0
```

## 工作流不变量

正式提交、阻塞和材料版本完成后，数据库组合证据为：

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

审计记录均显示任务状态和工作流未改变：

```text
R26_PROGRESS_DRAFT_SAVED       2  task_unchanged=true  workflow_unchanged=true
R26_PROGRESS_DRAFT_DELETED     1  task_unchanged=true  workflow_unchanged=true
R26_PROGRESS_SUBMITTED         1  task_unchanged=true  workflow_unchanged=true
R26_MATERIAL_UPLOADED          1  task_unchanged=true  workflow_unchanged=true
R26_MATERIAL_VERSION_UPLOADED  1  task_unchanged=true  workflow_unchanged=true
```

完整组合取证说明见
`docs/product/evidence/R26_GATE3B/API_AND_DATABASE_PROOF.md`。

## 自动化覆盖

自动化覆盖超过要求的 24 项门禁，包括：

- 草稿保存、恢复、删除、陈旧版本 409；
- 无阻塞和有阻塞提交、阻塞必填、人员和部门协助；
- PDF、PNG、JPG、DOCX、XLSX；
- 非法扩展名、MIME、魔数和双扩展；
- 中文文件名、XSS 文本、上传中断；
- V1→V2、历史版本下载；
- 幂等重复提交；
- 匿名、观察者、跨项目 IDOR；
- 提交后任务状态、当前节点和任务数量不变；
- Web 客户端只允许 Gate 3B 路径，不调用 complete/approve/reject/return/transition；
- 工作台、项目卡、地图、工序详情、历史和材料版本一致；
- 1440、1024、390 响应式交互。

最终仓库命令结果记录在本轮执行台账；截图、浏览器帧回放和材料样本索引见
`docs/product/evidence/R26_GATE3B/README.md`。

## UAT 中发现并修复

- 日期时间原生控件在浏览器自动化中的可靠性：改为受控文本输入并保持服务端校验；
- 通用材料类型缺少替换入口：当前材料统一暴露“替换版本”；
- 替换后前端仍引用归档附件 ID：刷新后仅保留活动版本 ID；
- 旧审计摘要显示内部材料代码：统一映射为中文材料名称，新记录使用文件名；
- 空本地默认草稿触发误恢复：只对有意义的本地输入提示恢复。

## 明确未做

- 未完成任务、未创建下一任务、未推进当前节点；
- 未调用 complete、approve、reject、return 或 transition；
- 未开放第 12、13、17、18 步专项写入；
- 未修改成员或任务分配；
- 未修改 V1；
- 未访问 production；
- 未合并 `main`，未创建稳定 tag；
- 未进入 Gate 3C。
