# R26 Gate 2 真实只读数据联调报告

日期：2026-07-23

状态：已实现，等待产品负责人核对 staging 真实数据；未进入 Gate 3。

## 1. 范围与隔离

Gate 2 只在独立 staging 和隔离的 `/v2/*` 页面启用：

- `/v2/dashboard`
- `/v2/projects`
- `/v2/projects/:projectId`
- `/v2/progress?projectId=:projectId&taskId=:taskId`

运行开关：

```text
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
```

本轮没有修改 V1 页面、Prisma schema、migration、后端业务状态机或数据库业务数据，
也没有执行 migration、seed、production 部署、`main` 合并或 Gate 3 工作。

## 2. GET-only 读模型

新增独立后端读模型：

```text
GET /api/v2/dashboard
GET /api/v2/projects
GET /api/v2/projects/:projectId/workspace
GET /api/v2/tasks/:taskId
GET /api/v2/tasks/:taskId/progress-context
```

所有响应均包含：

```text
dataSource=database
readOnly=true
```

Controller 契约测试逐个检查五个处理器均为 `RequestMethod.GET`。前端只读客户端固定
使用 `method: GET`、无 request body，并拒绝 `/v2/*` 之外的 API 路径。页面没有
提交进展、上传文件、保存分配、增删成员、改负责人或推进流程的控件。

staging 浏览器完整操作期间，Playwright 运行时记录业务请求方法；nginx 最终日志快照
交叉核对到：

```text
/api/v2/* GET     53
/api/v2/* POST     0
/api/v2/* PUT      0
/api/v2/* PATCH    0
/api/v2/* DELETE   0
```

## 3. 真实数据映射

V2 页面从 staging PostgreSQL 读模型显示：

- 当前飞书用户、系统角色与权限；
- 项目列表、当前工序、风险、停滞原因和下一步；
- 与 API 一致的 18 节点流程地图；
- 工序详情、负责人、责任部门、协同人和评审人；
- SLA、逾期、截止时间；
- 必交材料、已上传材料和缺失材料；
- 最近项目动态；
- 项目负责人、部门项目负责人、项目成员及其当前任务；
- 公司有效部门与部门有效用户；
- 每个工序的主责部门、协同部门、建议负责人和未分配原因。

浏览器页面根节点命中 `data-source="database"`，真实数据模式没有渲染 Gate 1 fixture；
fixture 数据命中数为 0。staging 数据库中仍存在用于联调的演示命名人员及历史 UAT
项目，这些是数据库真实行而不是前端静态 fixture，保留给产品负责人在本闸门确认。

## 4. 服务端分配规则

18 个节点均有服务端分配规则。服务端按主责部门和协同部门建立候选池，再选择具体
有效用户；不会把任务直接分配给部门全员。每个节点返回：

```text
primaryDepartment
collaboratorDepartments
suggestedOwner
collaborators
reviewers
assignmentStatus
assignmentSource
availableActions
```

前端只展示返回值，不按角色名称或部门名称拼装负责人。自动分配预览没有保存按钮；
进展上下文强制 `progressSubmissionEnabled=false` 且不提供可执行写动作。

## 5. 三档真实交互结果

### 1440px

- 工作台首先显示真实“当前最重要任务”，没有统计卡抢占首屏；
- 项目列表展示 11 个数据库项目，风险、停滞原因、责任人和截止时间一致；
- 项目工作区显示 18 个真实节点、7 个项目成员和 18 行自动分配预览；
- 第 6、12、17、18 步可点击；第 12 步刷新恢复同一节点；
- 关闭抽屉后地图位置与比例保持；
- 第 18 步明确说明系统建议不能替代授权人员人工决定；
- 进展页只有真实上下文，没有表单、文件上传或写按钮。

### 1024px

- 四页没有页面级横向溢出；
- 固定流程地图仍可读，370px 抽屉保留足够地图上下文；
- 筛选器不出现过度换行；
- 进展页仍为只读，没有输入控件。

### 390px

- 当前任务位于第一屏，项目卡可读可点；
- 不机械缩小桌面 SVG，改用 18 节点移动总览；
- 点击节点后进入全屏工序 sheet；
- sheet 顶部状态/关闭和底部只读动作固定，内容独立滚动；
- 页面没有横向溢出，没有输入框、文件选择器或业务写按钮。

三档检查均为长期 skeleton 0、console error 0、page error 0。

## 6. 截图证据

证据目录：`docs/product/evidence/R26_GATE2/`

| 视口 | 页面/状态 | 文件 |
| --- | --- | --- |
| 1440 | 工作台 | `01-dashboard-1440.png` |
| 1440 | 项目列表 | `02-projects-1440.png` |
| 1440 | 项目工作区 | `03-workspace-1440-full.png` |
| 1440 | 第 18 步抽屉 | `04-workspace-step18-1440.png` |
| 1440 | 项目成员与分工 | `05-members-1440.png` |
| 1440 | 自动分配预览 | `06-assignment-preview-1440.png` |
| 登录会话固定视口 | 进展只读上下文 | `07-progress-readonly-session.jpg` |
| 1024 | 项目列表 | `09-projects-1024.png` |
| 1024 | 项目工作区抽屉 | `10-workspace-drawer-1024.png` |
| 390 | 项目列表 | `13-projects-390.png` |
| 390 | 移动流程总览 | `14-workspace-mobile-overview-390.png` |
| 390 | 全屏工序 sheet | `15-workspace-mobile-sheet-390.png` |
| 1440 | 数据口径修复：第 15 步待分配 | `16-data-consistency-step15-1440.png` |

浏览器全页截图对长页面曾生成空白图，已从证据集中剔除；没有使用空白文件充当验收证据。
进展页以同一已登录会话的固定视口截图和三档实际交互断言共同取证。

## 7. 自动化与仓库检查

```text
pnpm install --frozen-lockfile                                      PASS
pnpm lint                                                           PASS
pnpm typecheck                                                      PASS
pnpm test                                                           PASS
  Web                                                               29 files / 87 tests
  API                                                               58 files / 225 tests
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
pnpm --filter @feishu-timeline/web build                            PASS
pnpm --filter @feishu-timeline/api build                            PASS
pnpm --filter @feishu-timeline/api prisma:validate                  PASS
```

Docker Hub 拉取 `node:24-alpine` metadata 两次超时，因此 staging 使用本机已经完成并
通过检查的构建产物制作临时镜像，只重建 staging API/Web 容器；未运行 migration 或
seed。API、Web 与 nginx 容器均为 healthy，production 未受影响。

## 8. 数据口径修复复核（2026-07-24）

产品负责人指出技术门禁通过后仍需核对真实业务口径。本次在不修改数据库业务数据、
V1、状态机和写接口的前提下修复：

- 登录人没有同步部门时，明确显示“系统管理员 · 组织部门待同步”，不再把缺失组织
  字段误写成普通业务部门；
- 工作台责任人和责任部门来自当前真实任务及服务端节点规则，不再使用登录人身份拼接；
- 项目卡、项目工作区统一以当前步骤显示进度，当前项目均为 `12 / 18`；
- 第 12 步使用真实 `taskRound=1`，流程节点和详情均显示“第 1 轮”；
- 第 17 步从月度计划返回值显示 `0/12`，移除固定 `3/12`；
- 尚未生成的第 13～18 步不再展示建议人冒充现任负责人，统一显示“负责人待分配 /
  尚未生成”；
- 18 节点服务端部门规则按业务责任表返回；第 15 步为“生产部”，且因公司目录没有
  生产部而明确保持未分配；
- 候选人只允许来自当前项目的有效成员，取消从公司目录任取一人的兜底；
- 项目卡新增明确的责任部门；真实流程地图的可访问名称使用当前项目颜色名，不再残留
  “深海蓝”静态文案。

staging 使用李晓晨飞书账号重新检查：

```text
工作台：样车驾驶室评审 / 李晓晨 / 质量管理部 / 下一项为空
项目卡：样车驾驶室评审 / 李晓晨 / 质量管理部 / 12 / 18
工作区：样车驾驶室评审 / 李晓晨 / 质量管理部 / 12 / 18
第 12 步：第 1 轮 / 已逾期
第 15 步：生产部 / 负责人待分配 / 尚未生成
第 17 步：0 / 12
节点数量：18
console error：0
```

本次浏览器复核的 nginx 日志：

```text
/api/v2/* GET      16
/api/v2/* POST      0
/api/v2/* PUT       0
/api/v2/* PATCH     0
/api/v2/* DELETE    0
```

历史演示成员和 UAT 项目登记为 `R26-DATA-001`。本轮没有删除、改名、归档或修改这些
数据库行；后续须经数据治理审批处理，审计记录不得物理删除。

最终回归：

```text
pnpm install --frozen-lockfile                                      PASS
pnpm lint                                                           PASS
pnpm typecheck                                                      PASS
pnpm test                                                           PASS
  Web                                                               30 files / 90 tests
  API                                                               59 files / 231 tests
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
pnpm --filter @feishu-timeline/web build                            PASS
pnpm --filter @feishu-timeline/api build                            PASS
pnpm --filter @feishu-timeline/api prisma:validate                  PASS
git diff --check                                                    PASS
```

## 9. 待产品负责人确认

- [ ] staging 当前飞书用户与权限符合预期
- [ ] staging 项目、风险、当前工序和动态符合预期
- [ ] staging 项目成员、部门和分工符合预期
- [ ] 18 节点负责人/协同人/评审人和未分配原因符合业务口径
- [ ] 允许进入 Gate 3

当前决定：

```text
R26_GATE2_IMPLEMENTED
READ_ONLY_REAL_DATA_CONNECTED
ZERO_BUSINESS_WRITE_REQUESTS
AWAITING_PRODUCT_OWNER_REAL_DATA_CONFIRMATION
STOP_BEFORE_GATE3
```
