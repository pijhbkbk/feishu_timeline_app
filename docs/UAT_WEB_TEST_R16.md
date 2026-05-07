# UAT_WEB_TEST_R16.md

## 目标

R16 使用 Playwright 操作真实网页，验证轻卡定制颜色开发系统的中文 UI、项目看板、18 步工序、材料提交、第 12 步退回、第 17 步月度评审、第 18 步颜色退出和数据中心。

## 测试策略

- 主测试环境：本地 PostgreSQL / Redis / API / Web，由 Playwright runner 自动 seed。
- 生产站点：`https://timeline.all-too-well.com` 仅做未登录只读 smoke，不创建项目、不上传材料、不推进流程。
- 自动化项目统一前缀：
  - `UAT-自动化-深海蓝-`
  - `UAT-自动化-星河银-`
  - `UAT-自动化-极光白-`

## 测试前检查

### 线上只读页面

| 页面 | 结果 |
|---|---|
| `/dashboard` | 200 |
| `/projects` | 200 |
| `/projects/timeline` | 200 |
| `/materials` | 200 |
| `/monthly-reviews` | 200 |
| `/analytics` | 200 |
| `/api/health` | 200 |

说明：生产环境已部署 `feat/r16-ui-business-e2e`，未开启 mock 登录，本轮未在生产写入 UAT 数据；受保护数据接口的未登录 401 属于预期鉴权边界。

### 稳定选择器

| 区域 | `data-testid` |
|---|---|
| 工作台 | `dashboard-page` |
| 项目时间线看板 | `project-timeline-board` |
| 项目列表 | `project-list-page` |
| 新建项目按钮 | `create-project-button` |
| 项目表格 | `project-table` |
| 工序清单 | `task-list-table` |
| 工序详情抽屉 | `task-detail-drawer` |
| 材料中心 | `materials-page` |
| 材料上传 | `material-upload-button` |
| 第 12 步评审区 | `sample-cab-review-panel` |
| 第 17 步月度评审 | `monthly-review-board` |
| 第 18 步颜色退出 | `color-exit-panel` |
| 数据中心 | `analytics-page` |

## 18 步测试基准

测试常量位于 `apps/web/tests/playwright/r16-fixtures.ts`，覆盖 18 个节点的步骤号、节点名称、期限说明、输出物、阻塞属性和关键断言。重点规则：

- 第 4 步完成后并行创建第 5 步和第 6 步。
- 第 6 步完成后并行创建第 7 / 9 / 10 步。
- 第 9 步独立进行，不阻塞主线。
- 第 12 步不通过退回第 11 步并生成新轮次。
- 第 13 步固定金额 `10000` 元。
- 第 16 步完成后生成第 17 步 12 个月度评审。
- 第 18 步可录入年产量并显示系统退出建议。

## 本轮创建的本地 UAT 项目

最近一次全量 Playwright 回归创建的项目：

| 项目编号 | 项目名称 | 用途 |
|---|---|---|
| `R16-20260507130414-1C467E` | `UAT-自动化-星河银-20260507130414` | 1→6、材料提交、第 9 步不阻塞 |
| `R16-20260507130425-0B30ED` | `UAT-自动化-深海蓝-20260507130425` | 第 12 步退回、新轮次、评审附件 |
| `R16-20260507130431-DC6F49` | `UAT-自动化-星河银-20260507130431` | 第 13/17 步费用与月度评审 |
| `R16-20260507130435-B366B6` | `UAT-自动化-极光白-20260507130435` | 第 18 步颜色退出建议 |
| `R16-UI-20260507130441` | `UAT-自动化-深海蓝-20260507130441` | 真实项目表单创建与时间线看板检索 |
| `R16-20260507130455-6EAD80` | `UAT-自动化-极光白-20260507130455` | 全量回归补充退出场景 |

## 页面覆盖

- `/dashboard`
- `/projects`
- `/projects/new`
- `/projects/timeline`
- `/projects/:projectId/overview`
- `/projects/:projectId/workflow`
- `/projects/:projectId/tasks`
- `/projects/:projectId/materials`
- `/projects/:projectId/reviews`
- `/projects/:projectId/fees`
- `/projects/:projectId/color-exit`
- `/materials`
- `/monthly-reviews`
- `/analytics`

## 结论

R16 本地 UAT Web 验收通过。生产站点已完成 R16 部署、正式验收、运维巡检和只读 smoke，未写入生产 UAT 数据。
