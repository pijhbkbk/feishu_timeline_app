# R26 三个冗余页面移除报告

日期：2026-07-27

## 产品决定

为保持系统简洁，正式产品不再提供以下页面：

- `/progress`、`/v2/progress`、`/legacy/progress`
- `/admin/workflow-templates`
- `/admin/dictionaries`

## 删除范围

- 删除三套进展提交路由、专属页面组件、客户端和测试代码。
- 删除主导航“进展提交”，正式主导航收敛为“工作台 / 项目列表 / 我的任务 / 系统管理”。
- 工作台、任务页和项目页原有的“提交进展”入口改为“打开工序”，统一进入项目工作区。
- 删除后台“流程模板”“基础字典”入口、页面渲染分支、客户端请求函数及对应管理 API。
- 后台总览不再展示流程模板管理入口，改为显示真实启用角色统计。
- 删除 `/progress` 的兼容重写；三个已移除页面不再被任何正式导航或 CTA 引用。

## 明确保留

- 不删除数据库中的历史进展、材料、流程、评审或审计记录。
- 不修改 Prisma schema、migration 或任何业务数据。
- 不删除后端流程状态机、模板定义、字典枚举及其内部业务约束。
- 不改变项目工作区中的工序完成、专项评审和审计能力。

## 验收口径

- 三个页面及其别名返回 404。
- 正式导航只显示四个入口，且所有入口可访问。
- 工作台和我的任务不再产生 `/progress` 链接。
- 后台保留项目台账、工序台账、组织与人员、分工配置、角色权限、审计与异常。
- lint、typecheck、单元测试、Web/API build、Prisma validate 全部通过。
- 本地 staging 使用真实浏览器完成核心路由与移除路由回归，无 page/console error。

## 本机 Staging 验收结果

```text
/progress                              404
/v2/progress                           404
/legacy/progress                       404
/admin/workflow-templates              404
/v2/admin/workflow-templates           404
/admin/dictionaries                    404
/v2/admin/dictionaries                 404

/dashboard                             PASS
/projects                              PASS（新建项目入口仍可见）
/tasks                                 PASS
/admin                                 PASS
/admin/organization                    PASS
/admin/assignments                     PASS
/admin/audit-logs                      PASS
/projects/:projectId?taskId=:taskId    PASS（18 步流程地图可见）

主导航：工作台 / 项目列表 / 我的任务 / 系统管理
console/page errors: 0
staging seed: 0
Prisma migrations: 23 applied / 0 pending
production requests: 0
```

## 发布边界

本轮仅提交和推送代码，不部署 production；生产发布须另行授权。
