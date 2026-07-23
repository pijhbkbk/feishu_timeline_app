# R26 Gate 1 视觉证据索引

## 证据根目录

```text
/Users/lixiaochen/Downloads/feishu_timeline_app/test-results/r26-gate1/
```

该目录由 `.gitignore` 排除，文件保留在本机用于产品负责人视觉闸门。

## 核心页面截图

| 页面 | 1440×900 | 1024×900 | 390×844 |
| --- | --- | --- | --- |
| 工作台 | `screenshots/dashboard-1440.png` | `screenshots/dashboard-1024.png` | `screenshots/dashboard-390.png` |
| 项目管理 | `screenshots/projects-1440.png` | `screenshots/projects-1024.png` | `screenshots/projects-390.png` |
| 项目工作区 | `screenshots/project-workspace-1440.png` | `screenshots/project-workspace-1024.png` | `screenshots/project-workspace-390.png` |
| 进展提交第一步 | `screenshots/progress-step1-1440.png` | `screenshots/progress-step1-1024.png` | `screenshots/progress-390.png` |

完整绝对路径由“证据根目录 + 表内路径”组成。

## 重点交互截图

| 场景 | 文件 | 尺寸 |
| --- | --- | --- |
| 第 12 步选中及专项详情 | `screenshots/project-step12-selected-1440.png` | 1440×900 |
| 阻塞字段条件展开 | `screenshots/progress-blocker-1440.png` | 1440×900 |
| 静态提交成功反馈 | `screenshots/progress-success-1440.png` | 1440×900 |

`screenshots/full-page/` 额外保留滚动全页记录，不替代上表的固定视口证据。

## 三段录像

| 角色/场景 | 文件 |
| --- | --- |
| 员工：工作台 → 当前任务 → 三步提交 → 成功反馈 | `videos/employee-progress-flow.webm` |
| 项目经理：项目管理 → 风险项目 → 停滞节点与责任信息 | `videos/manager-risk-flow.webm` |
| 流程地图：步骤 06、12、17、18 与 URL 恢复 | `videos/flow-map-node-and-url-restore.webm` |

Playwright 原始录像文件也保留在同目录；上表三份为稳定命名副本。

## PPT 并排对比

| 顺序 | 文件 | 列顺序 |
| --- | --- | --- |
| 工作台 | `comparisons/apple-dashboard-vs-web.png` | Apple 工作台｜Web 工作台 |
| 项目管理 | `comparisons/apple-projects-vs-web.png` | Apple 项目管理｜Web 项目管理 |
| 项目工作区 | `comparisons/apple-flow-workspace-vs-web.png` | Apple 项目工作区｜P2 固定流程地图｜Web 项目工作区 |
| 进展提交 | `comparisons/apple-progress-vs-web.png` | Apple 进展提交｜Web 进展提交 |

对比图只用于人工观察信息结构、字号、留白、状态语义和主动作，不包含 Codex 自评分。

## 自动化对应关系

- 生成与断言入口：`apps/web/e2e/r26-gate1-static-v2.spec.ts`
- 截图用例：`R26-06`
- 录像用例：`R26-07`
- Playwright 结果：7/7 通过
- `/api/` 请求：0
- console error：0
- page error：0
