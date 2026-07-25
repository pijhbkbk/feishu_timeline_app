# R26 Gate 3A 产品负责人人工验收

日期：2026-07-24

staging：`http://localhost:8080`

验收项目：

```text
R26-G3A-UAT-20260724-1006
R26-G3A-UAT-成员分工-20260724-1006
```

当前状态：

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```

2026-07-24，产品负责人提交 Gate 3B 启动指令，明确确认 Gate 3A 项目成员、职责、
部门负责人、任务分配、影响预览、保护规则、数据一致性和最新项目记录排版通过。
以下细项保留为历史验收清单；最终批准状态以本文件末尾人工决定为准。

## 90 秒管理员正向路径

- [ ] 从“项目列表”进入指定 UAT 项目
- [ ] 打开“项目成员与分工”
- [ ] 从公司有效用户目录按姓名、部门或岗位找到成员
- [ ] 添加成员并设置项目职责、部门负责人和默认执行人
- [ ] 不逐个配置 18 个节点也能看懂系统建议
- [ ] 保存前明确看见未来、未开始、进行中和已完成任务的不同影响
- [ ] 选择作用范围并确认保存
- [ ] 保存后页面局部刷新，没有整页重载
- [ ] 在流程地图看到服务端返回的新负责人
- [ ] 在“项目记录”看到操作人、前后值、影响任务、原因、requestId 和时间
- [ ] 全流程在 90 秒内完成

## 数据一致性

- [ ] 成员表、自动分配预览和流程地图负责人一致
- [ ] 第 3、6 步显示采购成员
- [ ] 第 4、5、7、8、14 步显示工艺成员
- [ ] 第 9、12、17 步显示质量成员
- [ ] 第 11 步明确显示待分配，没有跨部门猜测负责人
- [ ] 一个节点只有一名主负责人，协同人和评审人单独展示
- [ ] 前端没有根据部门/角色文案自行拼接负责人

## 安全与负向路径

- [ ] 普通成员不能添加、编辑或删除项目成员
- [ ] 匿名请求返回 401
- [ ] 无权限请求返回 403
- [ ] 跨项目任务访问返回 403 或 404
- [ ] 重复提交不生成重复成员或重复任务分配
- [ ] 两名管理员并发修改时，一个成功、另一个返回 409
- [ ] 有活动任务的成员必须先选择转交人才能移除
- [ ] 删除项目负责人前必须先指定新负责人
- [ ] 已完成任务和历史轮次负责人不改变
- [ ] 进行中任务变更必须逐项确认并填写原因
- [ ] 审计记录不包含 Cookie、Token、Secret 或完整敏感请求体

## 响应式产品体验

- [ ] 1440px 成员列表、影响预览、地图和审计记录层级清楚
- [ ] 1024px 抽屉出现后主体信息仍可读
- [ ] 390px 添加/编辑成员使用可独立滚动的全屏 sheet
- [ ] 390px 顶部关闭和底部主动作固定且不遮挡内容
- [ ] 三档均无长期 skeleton、横向溢出、console error 或 page error

## Gate 3B 边界

- [ ] `/v2/progress` 仍不能保存或提交真实进展
- [ ] 材料上传仍未开放
- [ ] 完成工序、评审和流程推进仍未开放
- [ ] 第 12、13、17、18 步专项写操作仍未开放
- [ ] V1、production、`main` 和稳定 tag 未被本轮改变

## 证据

- [ ] 已查看 `docs/product/evidence/R26_GATE3A/` 的 1440、1024、390 截图
- [ ] 已查看 `R26_GATE3A_ACTUAL_BROWSER_STATE_SEQUENCE.mp4`
- [ ] 已理解该视频为真实浏览器状态序列，不是连续屏幕录制
- [ ] 已核对 `R26_GATE3A_PROJECT_MEMBER_ASSIGNMENT_REPORT.md` 的 API 写请求清单
- [ ] 已核对报告中的数据变更和审计记录索引

## 人工决定

- [x] 确认 Gate 3A 项目成员与分配产品体验
- [x] 允许进入 Gate 3B 进展提交与材料上传

批准状态：

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```

### 最新项目记录排版收口

- [x] staging 运行 `9bca77260a46386408c3e5384c25b15040d5bbb7`
- [x] 真实飞书 OAuth 用户为李晓晨
- [x] 1440px 时间、摘要、操作人无重叠
- [x] 1024px 无横向溢出、无重叠
- [x] 390px 使用单列堆叠，摘要行高为 26.4px
- [x] 内部英文审计动作代码未显示
- [x] console error 为 0
- [x] Gate 3A 分支已推送

证据：

- `docs/product/evidence/R26_GATE3A/13-project-records-fixed-1440.png`
- `docs/product/evidence/R26_GATE3A/14-project-records-fixed-1024.png`
- `docs/product/evidence/R26_GATE3A/15-project-records-fixed-390.png`
