# R26 当前生产 UI 截图

## 范围

- 域名：`https://timeline.all-too-well.com`
- 日期：2026-07-23
- 视口：Safari 可见视口 1228 × 768
- 正式路由：48
- 补充故障态：1
- 代表项目：生产页面中可见的真实项目；未创建或修改数据

## 文件顺序

| 文件 | 路由 |
|---|---|
| `01-dashboard.png` | `/dashboard` |
| `02-projects.png` | `/projects` |
| `03-project-workspace.png` | `/projects/:projectId` |
| `04-tasks.png` | `/tasks` |
| `05-progress.png` | `/progress?taskId=` |
| `05b-progress-post-redirect-blank.png` | 页面内部改写为 `step=1` 后的空白态 |
| `06-material-upload.png` | `/materials/upload?taskId=` |
| `07-retrospectives.png` | `/retrospectives` |
| `08-project-retrospective.png` | `/projects/:projectId/retrospective` |
| `09-admin.png` | `/admin` |
| `10-guide.png` | `/guide` |
| `11-project-new.png` | `/projects/new` |
| `12-flow-map-portal.png` | `/projects/flow-map` |
| `13-project-timeline.png` | `/projects/timeline` |
| `14-project-timeline-board.png` | `/projects/timeline-board` |
| `15-materials.png` | `/materials` |
| `16-monthly-reviews.png` | `/monthly-reviews` |
| `17-reviews.png` | `/reviews` |
| `18-analytics.png` | `/analytics` |
| `19-colors.png` | `/colors` |
| `20-settings.png` | `/settings` |
| `21-tasks-pending.png` | `/tasks/pending` |
| `22-tasks-overdue.png` | `/tasks/overdue` |
| `23-tasks-my.png` | `/tasks/my` |
| `24-todos.png` | `/todos` |
| `25-project-overview.png` | `/projects/:projectId/overview` |
| `26-project-flow-map.png` | `/projects/:projectId/flow-map` |
| `27-project-workflow.png` | `/projects/:projectId/workflow` |
| `28-project-tasks.png` | `/projects/:projectId/tasks` |
| `29-development-report.png` | `/projects/:projectId/development-report` |
| `30-samples.png` | `/projects/:projectId/samples` |
| `31-standard-boards.png` | `/projects/:projectId/standard-boards` |
| `32-paint-procurement.png` | `/projects/:projectId/paint-procurement` |
| `33-performance-tests.png` | `/projects/:projectId/performance-tests` |
| `34-pilot-production.png` | `/projects/:projectId/pilot-production` |
| `35-project-reviews.png` | `/projects/:projectId/reviews` |
| `36-project-fees.png` | `/projects/:projectId/fees` |
| `37-production-plans.png` | `/projects/:projectId/production-plans` |
| `38-mass-production.png` | `/projects/:projectId/mass-production` |
| `39-color-evaluation.png` | `/projects/:projectId/color-evaluation` |
| `40-color-exit.png` | `/projects/:projectId/color-exit` |
| `41-project-materials.png` | `/projects/:projectId/materials` |
| `42-project-attachments.png` | `/projects/:projectId/attachments` |
| `43-project-logs.png` | `/projects/:projectId/logs` |
| `44-admin-users.png` | `/admin/users` |
| `45-admin-roles.png` | `/admin/roles` |
| `46-admin-dicts.png` | `/admin/dicts` |
| `47-admin-workflow-nodes.png` | `/admin/workflow-nodes` |
| `48-admin-audit-logs.png` | `/admin/audit-logs` |

## 注意

- 截图忠实保留了骨架屏、加载页、占位页和空白故障；没有用本地页面替换生产证据。
- Safari 可访问性树与截图在主项目工作区出现不一致：数据文本已出现，但可见层仍停留骨架屏。这是当前 UI 失败证据，不是截图后处理问题。
- 截图未包含或导出认证材料。
