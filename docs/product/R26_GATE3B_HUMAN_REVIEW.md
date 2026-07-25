# R26 Gate 3B 产品负责人人工验收

## 当前状态

Gate 3B 已在独立 staging 实现，尚未被产品负责人判定通过。

```text
AWAITING_PRODUCT_OWNER_GATE3B_CONFIRMATION
STOP_BEFORE_GATE3C
```
## 验收环境

- staging：`http://localhost:8080`
- 飞书用户：李晓晨
- 应用提交：`4f92e8d`
- 镜像：`r26-gate3b-4f92e8d`
- 项目：`R26-G3B-UAT-进展提交-20260724-2136`
- 项目 ID：`cmryzlcre0001m9011z4277c5`
- 任务 ID：`cmryzlcs20006m901meo53q8v`

建议从 `/v2/dashboard` 开始，不直接输入进展页 URL。

## 60 秒主路径

- [ ] 工作台第一屏直接看到当前任务和“提交工作进展”；
- [ ] 点击后项目、工序、本人、负责人和截止时间已经带出；
- [ ] 第一步只需选择进展状态、填写本次完成内容和下一步；
- [ ] 第二步选择“遇到阻塞”后，才出现阻塞详细字段；
- [ ] 可选择协助人员或部门，并填写预计解除时间和影响；
- [ ] 第三步能识别必交、已交和缺失材料；
- [ ] 能上传文件、查看进度、取消、查看和替换版本；
- [ ] 提交成功反馈明确说明“工作流未推进”；
- [ ] 全程不重复选择项目、工序或本人；
- [ ] 主路径可在 60 秒内完成。

## 提交后联动

- [ ] 工作台显示最新进展/阻塞；
- [ ] 项目列表卡片显示停滞原因、负责人和预计解除时间；
- [ ] 流程地图当前节点出现阻塞角标；
- [ ] 工序详情显示协助对象、材料数量和最新进展；
- [ ] 项目记录显示中文可读摘要，没有内部英文动作代码；
- [ ] 进展历史新增且旧记录不可编辑；
- [ ] 材料当前版本为 V2，V1 可只读查看；
- [ ] 刷新页面后数据仍一致。

## 工作流边界

- [ ] 成功反馈显示 `taskStatusChanged=false`；
- [ ] 成功反馈显示 `workflowTransitioned=false`；
- [ ] 任务仍为 `READY`；
- [ ] 当前节点仍为 `PROJECT_INITIATION`；
- [ ] 没有创建下一工序；
- [ ] 页面没有完成工序、通过、退回、收费确认、月度评审或退出决定入口。

## 草稿与异常

- [ ] 保存草稿后刷新可以恢复；
- [ ] 删除草稿后正式进展历史仍保留；
- [ ] 空的本地默认值不会误提示恢复；
- [ ] 有意义的本地输入在会话失效后由用户确认是否恢复；
- [ ] 两个标签编辑同一草稿时，陈旧写入收到 409；
- [ ] 双击提交不产生两条正式记录；
- [ ] 匿名、观察者和跨项目 taskId 均不能写入。

## 三档视口

### 1440

- [ ] 三步表单、阻塞态、材料 V1/V2、提交成功、地图联动均可读；
- [ ] 没有长期 skeleton、横向溢出、console/page error。

### 1024

- [ ] 进展历史可读；
- [ ] 工序抽屉出现后地图仍保留足够上下文；
- [ ] 阻塞摘要、协助对象和主动作在首屏可见。

### 390

- [ ] 流程节点使用移动端总览，不机械缩小桌面图；
- [ ] 节点详情为全屏 sheet；
- [ ] 输入框获得焦点后仍可继续下一步；
- [ ] 底部主动作固定但不遮挡内容；
- [ ] 完全没有页面级横向溢出。

## 证据入口

- 截图、回放与材料样本：`docs/product/evidence/R26_GATE3B/README.md`
- API 和数据库不变量：`docs/product/evidence/R26_GATE3B/API_AND_DATABASE_PROOF.md`
- 实施报告：`docs/product/R26_GATE3B_PROGRESS_MATERIAL_REPORT.md`

两段 MP4 为真实浏览器交互帧按时间顺序合成的验收回放，用于快速复核关键状态，
不是未经剪辑的连续屏幕录制。产品验收仍应在 staging 实际点击。

## 人工决定

- [ ] `R26_GATE3B_PASSED`
- [ ] `PROGRESS_AND_MATERIALS_ACCEPTED`
- [ ] `READY_FOR_GATE3C_WORKFLOW_TRANSITION`

未勾选前保持：

```text
R26_GATE3B_IMPLEMENTED
PROGRESS_DRAFT_AND_SUBMISSION_ENABLED_ON_STAGING
TASK_MATERIAL_UPLOAD_AND_VERSIONING_ENABLED_ON_STAGING
WORKFLOW_TRANSITION_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3B_CONFIRMATION
STOP_BEFORE_GATE3C
```
