# TIMELINE_NODE_INTERACTION_R17

## 节点交互设计

- `/projects/timeline` 项目时间线看板和 `/projects/:id/workflow` 单项目时间线均支持点击已触发工序节点打开右侧“工序详情抽屉”。
- 节点 hover 展示步骤号、工序名称、状态、负责人、责任部门、截止时间、逾期天数或剩余工作日，以及“点击查看详情”提示。
- 点击节点不跳转页面；看板保持当前位置，并通过 URL 写入 `taskId`。项目看板同时保留 `projectId`，例如 `/projects/timeline?projectId=xxx&taskId=yyy`。
- 刷新带 `taskId` 的页面后，前端自动恢复打开对应工序详情。
- 关闭抽屉时移除 `taskId`，保留其他筛选或项目参数。
- 桌面端使用右侧抽屉；移动端使用全屏弹层；操作按钮固定在抽屉底部。

## 抽屉字段结构

抽屉顶部展示：

- 步骤号、工序名称、状态、当前轮次。
- 负责人、责任部门、截止时间、是否逾期。

正文分区：

- 工序概况：所属项目、颜色名称、工序名称、工作内容、输出物、是否主线、是否阻塞主线、前置工序、后续工序。
- 责任信息：责任部门、负责人、协同部门、协同人、审批人 / 评审人、最近操作人。
- 时间与 SLA：期限规则、开始时间、截止时间、实际完成时间、剩余工作日、逾期天数、SLA 状态、时间进度条。
- 材料与附件：必交材料清单、已提交材料、附件数量、上传人、上传时间、版本号、材料状态、查看 / 下载 / 上传入口。
- 评审 / 审批：普通节点展示保存、完成工序、转交负责人；实际流转动作仍只调用后端已有流程接口。
- 流转记录：按时间倒序展示工作流流转与相关审计日志。

状态处理：

- 加载中显示中文 skeleton。
- 加载失败显示中文错误和“重新加载”。
- 403 或权限类错误显示“无权查看该工序详情”。
- 无附件显示“暂无附件”。
- 无流转记录显示“暂无流转记录”。

## API 设计

新增：

- `GET /api/workflows/tasks/:taskId/detail`

返回聚合字段：

- 基础：`taskId`、`projectId`、`stepCode`、`stepNumber`、`stepName`、`nodeCode`、`status`、`statusLabel`、`roundNo`。
- 责任：`owner`、`collaborators`、`approvers`、`department`。
- 工序：`isBlocking`、`isMainline`、`nodeType`、`workContent`、`outputName`。
- 时间：`deadline`、`schedule.ruleText`、`schedule.startedAt`、`schedule.dueAt`、`schedule.completedAt`、`schedule.remainingWorkdays`、`schedule.overdueDays`、`schedule.slaStatus`、`schedule.progressPercent`。
- 材料：`requiredMaterials`、`attachments`。
- 专项：`reviewDetail`、`feeSummary`、`monthlyReviewSummary`、`colorExitSummary`。
- 操作：`availableActions`。
- 记录：`flowLogs`。

完善：

- `GET /api/dashboard/project-timelines` 的每个 node 新增 `stepCode`、`stepName`、`status`、`ownerName`、`departmentName`、`isBlocking`、`nodeType`，并继续返回 `taskId`、`dueAt`、`overdueDays`。
- `GET /api/projects/:projectId/timeline` 已包含单项目节点 `taskId`，本轮在前端直接使用该字段驱动抽屉。

## 特殊节点展示规则

- 第 12 步“样车驾驶室评审”：展示通过、不通过 / 退回、评审结论、不通过原因、整改要求、整改责任人、评审通过时间、历史轮次。
- 第 13 步“颜色开发收费”：展示固定金额 `10000 元`、收费状态、收费凭证数量、财务确认人。
- 第 17 步“整车色差一致性评审”：展示周期 `12 个月`、已完成 `n / 12`、本月状态、逾期月份、月度评审台账入口。
- 第 18 步“颜色退出”：展示年产量、退出阈值、系统建议、人工结论、退出原因、生效日期。

## 测试覆盖

- 组件测试：节点点击 handler、抽屉负责人/责任部门/SLA/材料、12/13/17/18 步专项展示。
- Playwright：`apps/web/e2e/r17-timeline-node-interaction.spec.ts` 覆盖 `/projects/timeline` 打开项目卡片、点击第 1/6/12/13/17/18 步、关闭抽屉、刷新带 `taskId` 的 URL 自动恢复。
- 配置：`apps/web/playwright.config.mjs` 同时纳入 `tests/playwright/**/*.spec.ts` 和 `e2e/**/*.spec.ts`。

## 已知后续优化项

- “保存”和“转交负责人”按钮当前作为抽屉操作占位展示，后续可接入专用表单保存和负责人转交 API。
- 必交材料清单优先读取 `workflow_node_definitions.requiredAttachments`；当前种子数据未配置时显示“暂无必交材料配置”。
- 抽屉已展示附件查看 / 下载 / 上传入口，后续可在抽屉内直接嵌入轻量上传控件。
- 大数据量项目下，`flowLogs` 可继续拆分页和缓存。
