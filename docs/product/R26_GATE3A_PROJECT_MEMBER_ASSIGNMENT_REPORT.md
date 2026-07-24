# R26 Gate 3A 项目成员与任务分配报告

日期：2026-07-24

状态：已在独立 staging 实现并由产品负责人人工确认通过；允许进入 Gate 3B。

## 1. 范围与隔离

本轮只开放 `/v2/projects/:projectId` 内的项目成员和任务分配写操作：

- 从公司有效用户目录搜索并添加项目成员；
- 编辑成员项目职责、部门负责人、默认执行人和默认工序；
- 移除成员及活动任务安全转交；
- 预览并应用未来任务、未开始任务的负责人分配；
- 对进行中任务要求逐项确认和原因；
- 局部刷新成员页、分配预览、流程地图与项目记录。

本轮未开放：

- 保存或提交工作进展；
- 上传材料；
- 完成工序或推进流程；
- 第 12、13、17、18 步专项业务写入；
- V1 修改、production 部署、`main` 合并或稳定 tag。

staging 信息：

```text
URL                 http://localhost:8080
UAT project code    R26-G3A-UAT-20260724-1006
UAT project id      cmryawpo40001pa01qbz0aly5
image tag           r26-gate3a-d4a0bdd
deployed app commit d4a0bdd
branch              codex/r26-gate3a-project-member-assignment
```

API、Web、nginx、PostgreSQL、Redis 均为 healthy。staging 已应用 19 项 migration，
0 项待处理；本轮没有运行 seed。

## 2. 服务端分配与数据保护

分配裁决只在后端执行，优先级为：

```text
1. TASK_OVERRIDE
2. PROJECT_NODE_OVERRIDE
3. PROJECT_DEPARTMENT_LEAD
4. PROJECT_DEFAULT_ASSIGNEE
5. SINGLE_ELIGIBLE_MEMBER
6. UNASSIGNED
```

部门只确定候选池，不会把部门全员设为并列负责人。服务端统一返回
`primaryDepartment`、`collaboratorDepartments`、`suggestedOwner`、
`collaborators`、`reviewers`、`assignmentStatus`、`assignmentSource`、
`affectedTaskIds`、`conflicts` 和 `availableActions`；前端不根据部门或角色字符串
推导负责人。

新增的保护包括：

- 管理员/系统管理员或项目负责人才能管理成员与分配，普通成员保持只读；
- 匿名请求返回 401，跨项目任务使用项目作用域查询阻止 IDOR；
- 幂等键和请求哈希防止重复写入；
- `memberAssignmentVersion` 乐观锁和串行化事务冲突统一返回 409；
- 已完成任务和历史轮次不修改；
- 进行中任务必须显式确认并填写原因；
- 有活动任务的成员不能直接删除，必须同时指定转交人；
- 移除项目负责人前必须先指定新的项目负责人；
- 成员移除时只把活动任务转交给指定人员；未来工序配置不会跨部门错误转交，
  而是移除该成员并在无法重新解析时恢复为 `UNASSIGNED`；
- 工作流后续创建任务时复用同一项目分配配置，没有建立第二套状态机；
- 全部真实写入生成审计日志，记录 requestId、前后值、影响任务和变更原因。

## 3. Gate 3A API 清单

| 方法 | 路径 | 是否修改业务数据 |
| --- | --- | --- |
| POST | `/api/v2/projects/:projectId/assignment-preview` | 否，只计算影响 |
| POST | `/api/v2/projects/:projectId/members` | 是，添加成员 |
| PATCH | `/api/v2/projects/:projectId/members/:userId` | 是，编辑职责 |
| DELETE | `/api/v2/projects/:projectId/members/:userId` | 是，安全移除 |
| POST | `/api/v2/projects/:projectId/assignments/apply` | 是，应用分配 |
| PATCH | `/api/v2/projects/:projectId/tasks/:taskId/assignment` | 是，转交任务 |

前端 Gate 3A 客户端使用固定方法/路径白名单，并拒绝 progress、attachment 和
workflow-transition 路径。Gate 3B/3C 写能力仍关闭。

## 4. staging 真实操作与最终数据

使用已登录的李晓晨 staging 会话完成：

1. 添加采购成员，预览并确认第 3、6 步；
2. 添加质量成员，预览并确认第 9、12、17 步；
3. 添加工艺成员，预览并确认第 4、5、7、8、14 步；
4. 应用 11 个未来工序配置；
5. 将当前 `READY` 任务转交给工艺成员并填写原因；
6. 预览并执行带活动任务转交的成员移除；
7. 修复预览发现的未来节点跨部门转交问题后重新验证；
8. 重新加入工艺成员，保留最终四名项目成员；
9. 在流程地图和项目记录中核对负责人及审计结果。

最终项目事实：

```text
status                    IN_PROGRESS
currentNodeCode           PROJECT_INITIATION
memberAssignmentVersion   8
distinct members          4
member role rows          8
node assignment rows      11
active task status        READY
active task assignee      李晓晨
Gate 3A command rows       7
```

最终成员：

- 李晓晨：项目负责人；
- 演示采购专员：采购部部门负责人、默认执行人；
- 演示质量工程师：质量验证部部门负责人、默认执行人、评审人；
- 演示工艺工程师：工艺开发部部门负责人、默认执行人。

最终节点配置中，第 3、6 步为采购成员，第 4、5、7、8、14 步为工艺成员，
第 9、12、17 步为质量成员；第 11 步在安全移除后保持 `UNASSIGNED`，没有错误转交。
流程地图直接显示服务端 `suggestedOwner`，成员页、分配预览和地图使用同一后端结果。

staging 当前真实任务为 `READY`，不能在不推进流程的情况下构造 `IN_PROGRESS`。
因此“进行中任务需显式确认和原因”的正向真实写入没有通过修改业务状态来伪造；
API 单元测试覆盖其 409 拒绝和确认后允许路径。本轮严格没有为了取证改变状态机。

## 5. 数据变更与审计索引

| 审计 ID | 动作 | requestId | 结果 |
| --- | --- | --- | --- |
| `cmryb3ivs0009lb01uzwdep7p` | 添加采购成员 | `8a1f8fba-90da-4094-ad4f-19ff4a3afbd9` | SUCCESS |
| `cmryb45jt000plb01ffkey9s7` | 添加质量成员 | `ce95826a-294e-46ef-aab7-ae7dfb529192` | SUCCESS |
| `cmryb4kjy0017lb01mgj90g71` | 添加工艺成员 | `a4c719af-dd8e-4d32-a559-1b66c7e64364` | SUCCESS |
| `cmryb5qg3001xlb01btno3nmh` | 应用分配方案 | `58dce909-4a66-4c6e-a02d-8b9665294c96` | SUCCESS |
| `cmryb70xg0021lb01bpnjjb5c` | 转交当前任务 | `bbd38a20-3582-4d79-8a01-62c89efba037` | SUCCESS |
| `cmrybekss0001rl01pl7nxevl` | 安全移除工艺成员 | `a890b9a4-c7e7-47ee-b25b-45c41ec7784e` | SUCCESS |
| `cmrybetr6000jrl01leclzhqt` | 重新加入工艺成员 | `8fad927c-1ad2-4c5e-a39f-f3e231f24acf` | SUCCESS |

动作计数：

```text
R26_PROJECT_MEMBER_ADDED          4
R26_PROJECT_MEMBER_REMOVED        1
R26_PROJECT_ASSIGNMENTS_APPLIED   1
R26_WORKFLOW_TASK_REASSIGNED      1
```

匿名 `assignment-preview` 已实测返回 401。staging 禁用了 mock login，因此没有伪造
普通用户会话来声称真实 403；普通成员 403、跨项目 IDOR 和并发 409 由服务层与
Controller 测试覆盖。

## 6. 响应式和可见证据

证据目录：`docs/product/evidence/R26_GATE3A/`

| 视口 | 页面/状态 | 文件 |
| --- | --- | --- |
| 1440 | 添加采购成员影响预览 | `01-1440-add-purchase-impact-preview.png` |
| 1440 | 成员与分配初始状态 | `02-1440-members-and-assignments.png` |
| 1440 | 自动分配影响预览 | `03-1440-automatic-assignment-impact-preview.png` |
| 1440 | 项目审计记录 | `04-1440-project-audit-records.png` |
| 1440 | 最终成员与分配 | `05-1440-final-members-and-assignments.png` |
| 1024 | 成员与分配 | `06-1024-members-and-assignments.png` |
| 1024 | 编辑成员抽屉 | `07-1024-edit-member-drawer.png` |
| 390 | 成员与分配 | `08-390-members-and-assignments.png` |
| 390 | 添加成员全屏 sheet 与固定底部动作 | `09-390-add-member-fullscreen-sheet.png` |
| 390 | 成员变更影响预览 | `10-390-member-impact-preview.png` |
| 1440 | 流程地图分配一致性 | `11-1440-flow-map-assignment-consistency.png` |
| 1440 | 75% 地图负责人建议总览 | `12-1440-flow-map-owner-suggestions-75pct.png` |

`R26_GATE3A_ACTUAL_BROWSER_STATE_SEQUENCE.mp4` 是由真实浏览器操作状态截图组成的
20 秒 H.264 证据序列（1440×900，30fps），用于快速回看关键状态；它不是连续屏幕
录制，不能替代产品负责人亲自完成 90 秒操作。

三档页面均完成真实点击、搜索、抽屉/全屏 sheet、预览、保存和局部刷新检查；
未观察到长期 skeleton、console error 或 page error。

## 7. 自动化与完整质量门禁

```text
pnpm install                                           PASS
pnpm lint                                              PASS
pnpm typecheck                                         PASS
pnpm test                                              PASS
  Web                                                  31 files / 96 tests
  API                                                  60 files / 244 tests
pnpm --filter web build                                PASS
pnpm --filter api build                                PASS
pnpm --filter api prisma:validate                      PASS
git diff --check                                       PASS
```

自动化覆盖管理员添加、幂等、职责编辑、分配预览/应用、已完成任务不可变、进行中
任务确认和原因、活动任务移除转交、普通成员 403、匿名 401、跨项目 IDOR、并发 409、
审计信息、地图负责人和三处状态一致性。production 请求为 0。

## 8. 决定

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```

## 9. 项目记录排版修复（2026-07-24）

产品负责人指出正式项目的“项目记录”出现摘要逐字换行、操作人与内部动作代码重叠。
根因是记录列表使用三列卡片，而每张窄卡内部再次使用三列，摘要列被压缩到不足以正常
排版。

修复内容：

- 项目记录改为单列时间流，每条记录使用“时间 / 摘要 / 操作人”三段式宽度；
- 摘要列显式允许收缩，正文恢复 16px、1.65 行高；
- 长摘要和原因允许在词义边界自然换行，不再逐字形成竖排；
- 移动端改为时间、摘要、操作人纵向堆叠；
- 内部英文审计动作代码保留在 `data-record-action` 供测试和追踪，不再显示给用户。

staging 已更新：

```text
image tag     r26-gate3a-records-9bca772
app commit    9bca772
seed          NOT RUN
production    NOT CHANGED
```

完整检查：

```text
pnpm install                          PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 31 files / 97 tests；API 60 files / 244 tests）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
```

部署后 staging 五个服务均 healthy，19 项 migration 已应用且无待执行 migration。

## 10. 最终视觉收口与产品批准（2026-07-24）

- 按产品负责人 Gate 3B 启动指令重新完成真实飞书 OAuth，账号为李晓晨；
- staging 完整应用提交为 `9bca77260a46386408c3e5384c25b15040d5bbb7`；
- 1440px 四条记录均为时间、摘要、操作人三段式布局，重叠数 0；
- 1024px 四条记录横向溢出 0、重叠 0；
- 390px 页面横向溢出 0，记录为单列布局，摘要行高 26.4px；
- 内部 `record.action` 未进入可见文本；
- 浏览器 console error 0；
- Gate 3A 分支已推送。

新增证据：

- `docs/product/evidence/R26_GATE3A/13-project-records-fixed-1440.png`
- `docs/product/evidence/R26_GATE3A/14-project-records-fixed-1024.png`
- `docs/product/evidence/R26_GATE3A/15-project-records-fixed-390.png`

最终批准：

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```
