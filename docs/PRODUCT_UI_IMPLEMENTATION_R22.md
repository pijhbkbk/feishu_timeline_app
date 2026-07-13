# R22 Product UI Implementation

## 实现范围

R22 Gate 1–7 实现八个正式页面、五项主导航、真实 API/数据模型、响应式、测试和预发布验收；Gate 8 生产部署仍由发布闸门控制。

| 能力 | 路由 / 实现 |
|---|---|
| 五项主导航 | 工作台、项目管理、我的任务、进展提交、复盘分析；搜索、通知、帮助和个人菜单为辅助入口 |
| 员工工作台 | `/dashboard`；大字号问候、当前/下一任务、真实 KPI 和动态 |
| 项目管理 | `/projects`；四 KPI、快速/高级筛选、真实停滞原因和宽项目卡 |
| 项目工作区 | `/projects/:projectId?taskId=...`；真实 18 节点、约 70/30 流程与工序布局 |
| 进展提交 | `/progress?taskId=...`；做了什么、是否阻塞、上传材料三步 |
| 我的任务 | `/tasks`；待处理、待评审、即将到期、已逾期、已完成五类视图 |
| 材料上传 | `/materials/upload?taskId=...`；必交清单、安全上传、版本与替换归档 |
| 生命周期复盘 | `/projects/:projectId/retrospective`；真实计划/实际、瓶颈、草稿、完成锁定和导出 |
| 后台管理 | `/admin`；真实用户/部门/模板/审计指标和四个管理模块，管理员双重门禁 |

## 后端与数据边界

- `GET /dashboard/personal-overview` 聚合个人当前任务、KPI 和活动。
- 项目列表扩展真实进度、当前任务、停滞节点/天数/原因/责任人/协助人/预计解除时间。
- `POST /tasks/:taskId/progress` 幂等追加进展与阻塞并写审计，不直接推进流程。
- 任务接口支持五类任务视图及最近进展、阻塞、材料数和完成度。
- 完成工序前由后端核对流程节点必交材料，返回具体缺项。
- 附件保留 R19B 扩展名、MIME、魔数、大小、路径和权限校验；新增材料类型、版本与替换关联，旧文件不被覆盖。
- `ProjectRetrospective` 及 migration 保存结构化改进项；只有已关闭项目可完成并锁定复盘。
- `/admin/overview` 使用真实组织、权限、模板、节点参数和审计数据；后端再次校验管理员权限。

Prisma 变更均有 migration：`20260713103000_add_task_progress_updates` 与 `20260713150000_add_project_retrospectives`。

## 视觉与质量

- Apple 系统字体栈、36–40px 页面标题、16px 正文、8px 间距逻辑、低饱和色与统一圆角/阴影集中在 `apps/web/src/app/r22.css`。
- 正式页面在 1920、1440、1024、390 四档视口生成截图；八页视觉评分为 94–97。
- 截图与逐页结论：`docs/design/SCREENSHOT_COMPARISON_R22.md`。
- 六维评分：`docs/design/VISUAL_ACCEPTANCE_R22.md`。
- 质量数据：`test-results/r22/local/quality-metrics.json`；本地八页无 page/console error。

## 验证结果

- 锁定依赖安装、lint、typecheck、Web/API 单测、双端 build、Prisma validate：PASS。
- 主链路 E2E：PASS。
- 全量 Playwright：36/36 PASS。
- R22 组件契约：Typography、三类按钮、状态、任务主卡、项目风险卡、进度、三步提交、材料、复盘、后台与状态面板均覆盖。
- Semgrep、SCA、密钥扫描：PASS；R19B 安全边界未回退。

## 发布边界

- 本地与预发布可使用明确的测试 seed；生产不得 seed 演示账号、演示项目或硬编码进度。
- Gate 7 完成后只提交预发布地址、截图、测试和差异，必须停止等待用户确认。
- 未获得“发布闸门已确认”前，不部署生产，也不宣称 R22 全量通过。
