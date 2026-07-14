# R22 Screenshot Comparison — Gate 6

## 证据索引

每个正式页面均有 1920、1440、1024、390 四档完整页面截图。并排图使用 1440 首屏与对应 PPT 页面，避免把长页面整体压缩后失去可读性。

| 页面 | PPT 参考 | Web 截图目录 | PPT｜Web 并排图 |
|---|---|---|---|
| 员工工作台 | `r22-ppt-render/slide-04.png` | `test-results/r22/local/dashboard-*.png` | `test-results/r22/diffs/local/dashboard-comparison.png` |
| 项目管理 | `r22-ppt-render/slide-05.png` | `test-results/r22/local/projects-*.png` | `test-results/r22/diffs/local/projects-comparison.png` |
| 项目工作区 | `r22-ppt-render/slide-06.png` | `test-results/r22/local/project-workspace-*.png` | `test-results/r22/diffs/local/project-workspace-comparison.png` |
| 进展提交 | `r22-ppt-render/slide-07.png` | `test-results/r22/local/progress-submit-*.png` | `test-results/r22/diffs/local/progress-submit-comparison.png` |
| 我的任务 | `r22-ppt-render/slide-08.png` | `test-results/r22/local/tasks-*.png` | `test-results/r22/diffs/local/tasks-comparison.png` |
| 材料上传 | `r22-ppt-render/slide-09.png` | `test-results/r22/local/materials-upload-*.png` | `test-results/r22/diffs/local/materials-upload-comparison.png` |
| 生命周期复盘 | `r22-ppt-render/slide-10.png` | `test-results/r22/local/retrospective-*.png` | `test-results/r22/diffs/local/retrospective-comparison.png` |
| 后台管理 | `r22-ppt-render/slide-11.png` | `test-results/r22/local/admin-*.png` | `test-results/r22/diffs/local/admin-comparison.png` |

进展提交另有 `progress-1440-step-2.png` 与 `progress-1440-step-3.png`，证明条件式阻塞字段和安全材料上传步骤真实存在。质量记录见 `test-results/r22/local/quality-metrics.json`。

## 逐页结论

| 页面 | 信息层级与主动作 | 字号、留白、卡片 | 状态、交互与响应式 | 结论 |
|---|---|---|---|---|
| 工作台 | 问候、今日数量、当前大任务卡、下一任务、四项 KPI、最近动态；主动作直达真实任务进展 | 标题 36–40px、正文 16px，当前任务为视觉中心 | 风险/材料/进度来自 API；四档视口无横向溢出 | PASS |
| 项目管理 | 四项概览、五类快速筛选、项目宽卡；唯一顶级动作“新建项目” | 高级条件默认收起，避免密集筛选器；卡片有充分行高 | 风险卡明确停滞节点、天数、原因、责任人、协助人、预计解决时间 | PASS |
| 项目工作区 | 项目摘要、整体进度、左侧真实 18 节点、右侧当前工序 | 1440/1920 约 70/30，1024/390 自动堆叠 | 点击节点切换详情并同步 URL；必交材料缺失由后端明确返回 | PASS |
| 进展提交 | 当前任务、三步导航、单一问题、任务上下文与历史 | 单步向导代替 PPT 三列常驻，移动端仍可在 60 秒内操作 | 阻塞字段条件展开；写进展历史，不直接改变流程状态 | PASS |
| 我的任务 | 五个任务桶、宽任务卡、真实动态主动作 | 不使用密集表格，正文与交付信息保持可读 | 评审、收费、月度评审、退出结论按节点生成动作 | PASS |
| 材料上传 | 任务上下文、必交清单、上传区、版本历史 | 桌面左右分栏、历史在下；移动端纵向 | 使用真实安全上传、材料类型、V1/Vn 和替换归档，不覆盖旧文件 | PASS |
| 生命周期复盘 | 项目结论、四 KPI、计划/实际、关键卡点、经验与改进 | 长页面分区清晰，表格只承载阶段对比 | 真实生命周期聚合；草稿持久化、完成锁定、打印/PDF | PASS |
| 后台管理 | 四项系统指标、四个管理模块、异常审计 | 管理模块卡片取代占位页和密集设置表 | 前后端双重权限；普通用户不可见且直接访问被拒绝 | PASS |

## 共性检查

| 检查项 | 结果 |
|---|---|
| 信息层级与唯一主动作 | PASS |
| 页面主标题 36–40px、正文基准 16px | PASS |
| 低饱和中性色与可辨状态色 | PASS |
| 1920/1440/1024/390 拥挤、裁切、重叠、横向异常 | 未发现；Playwright 有显式 overflow 断言 |
| 旧一级导航与新导航并存 | 未发现 |
| PPT 注释或英文业务占位文案 | 未发现 |
| 无限 loading | 未发现；截图前必须通过业务就绪断言且 skeleton 数为 0 |
| 真实数据、权限、附件和流程边界 | PASS；测试 seed 仅用于本地和预发布 |

## 有意保留的产品化差异

- 项目工作区使用响应式规则网格表达 18 步，而不是复制 PPT 固定坐标；完整并行/退回拓扑仍由实时流程数据和既有流程地图能力承载。
- 进展提交采用逐步向导，不在一个页面同时展开三列，以保证 390px 可用性和 60 秒完成目标。
- 复盘与后台使用真实数据后，数值和行数不会与 PPT 示例数字一致；信息结构、比例与状态语义保持一致。

## 预发布最终证据

- 预发布地址：`http://localhost:8080`
- 运行 revision：以 `deploy/.state/current.env` 为准，必须与干净分支 HEAD 完全一致
- 真实身份：飞书 OAuth 用户“李晓晨”，`mockEnabled=false`，角色为 `admin`、`viewer`
- 原始截图：`test-results/r22/staging-release-gate/`
- 浏览器证据：`test-results/r22/staging-release-gate/browser-evidence.json`
- PPT｜Web 并排图：`test-results/r22/staging-release-gate/comparisons/`
- 进展提交三步证据：`test-results/r22/staging-release-gate/interactions/`

八个正式页面均以 1920×1080、1440×900、1024×900、390×844 原始视口重新采集，共 32 张完整页面截图；32/32 通过，skeleton、console error、page error、5xx 与横向溢出均为 0。另生成八张当前预发布首屏与 PPT 的并排图。
