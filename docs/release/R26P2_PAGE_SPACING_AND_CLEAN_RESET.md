# R26P2 页面留白修复与生产项目域清空

## 结论

```text
R26P2_PAGE_SPACING_FIXED
PRODUCTION_PROJECT_DOMAIN_RESET
PROJECTS_AND_OPERATIONAL_RECORDS=0
AUDIT_LOGS_PRESERVED
READY_FOR_MANUAL_TEST_FROM_SCRATCH
```

## 页面修复

“我的任务”和“系统管理”此前由 R22 内容组件承载在 V2 Shell 中，缺少 V2 原生页面的
居中内容框和响应式 gutter。本轮为两个页面补齐：

- 桌面：最大内容宽度 1504px，左右 32px gutter；
- 1024px：左右 24px gutter；
- 390px：左右 20px gutter；
- 不修改卡片内部结构、业务接口或移动端底部导航。

生产 Safari 已实际检查 `/tasks` 和 `/admin`，内容框居中、页边距正常。

## 发布身份

- runtime commit：
  `51ab39bbb18dbe2c0dd9d51adab03911c69223b0`
- branch：
  `codex/r26p2-page-spacing-clean-reset`
- `main` merge：
  `6a60eb50c9b6e8aa5b7edb106db507c35085efb4`
- production remote worktree：clean
- API/Web restart：`0 / 0`
- post-deploy error matches：0

## 删除前备份

- backup：
  `/var/backups/feishu-timeline-db/20260725T050659Z/feishu-timeline.dump`
- SHA256：
  `2702c4bb0ba795f003daeceb6ae82be338670bc334f843b71b9e48edc86701ec`
- checksum：PASS
- restore drill：PASS
- tables：`44 / 44`
- users：`12 / 12`
- projects：`1 / 1`
- audit logs：`22 / 22`

项目附件和历史孤立对象文件均先归档到同一备份目录，再从实时对象存储移除。

## 清空范围

生产数据库清空：

- projects、project members、node assignments；
- workflow instances、tasks、transitions；
- progress updates、drafts、blockers；
- attachments metadata、notifications；
- recurring plans、recurring tasks；
- colors、reviews、development fees、production plans；
- 其他由 project 外键级联的业务记录。

实时对象存储文件数为 0。

保留：

- users：12；
- departments：7；
- process templates：1；
- 角色、权限、流程节点、系统参数和工作日历；
- 不可篡改 audit logs：25。

清空动作写入三条新的系统审计记录。历史项目审计保留，但 `projectId` 已按外键规则
置空，不会重新形成项目或任务。

## 验证

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 129 / API 293）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
production release verify            PASS
production acceptance                PASS
```

生产真实页面：

- `/projects`：0 个项目，显示真实空状态；
- `/tasks`：0 项任务，显示真实空状态；
- 进展提交导航在没有当前任务时返回工作台；
- `/admin`：用户、部门和流程模板仍可用。

