# R26 项目搜索与顶部入口回归（2026-08-07）

## 问题与根因

- 原问题：项目列表右上角搜索图标只把 URL 改成 `?focus=search` 并跳到页面顶部，正式 V2 项目列表没有可操作的搜索表单。
- 衍生问题：带 `keyword` 刷新时，先发出的无关键字请求会被取消；旧请求的异常回调可能晚于新请求写入错误状态，导致已成功返回的筛选结果被“真实数据暂时不可用”覆盖。
- 根因：顶部入口、项目页搜索状态和真实数据请求生命周期没有形成同一条受控交互链。

## 修复范围

- 顶部搜索入口在同页打开、滚动并聚焦正式项目搜索框。
- 搜索关键字写入 URL，可刷新恢复；清除后保留搜索入口并恢复全部项目。
- 正式项目页通过后端 GET `keyword` 参数查询项目名称、项目编号、颜色名称或第 05 步确认的颜色编号。
- 旧请求取消后不再覆盖最新请求的成功状态。
- 顶部通知改为真实通知中心，帮助入口指向 `/guide`；账号菜单继续提供真实退出入口。

## 本地运行身份

- 环境：本机 Docker staging，仅代表 `localhost`。
- URL：`http://localhost:8080/projects?focus=search`
- Git 指针：`2081c3920bb5c41578ef9c189477d05f392896ad`（工作树包含未提交改动，不是可部署 commit）。
- Web image：`feishu-timeline-web:local-project-search-race-fix-20260807`。
- Web image digest：`sha256:df48a14bf346174e3a9a576a361037bd1a239743efadea8e7dd9c7845f91bdb9`。
- API health：healthy，但 `runtimeCommit/buildTime=unknown`、`release=development`，因此不满足不可变部署证明。

## 自动化验证

```text
pnpm --filter web lint       PASS
pnpm --filter web typecheck  PASS
pnpm --filter web test       PASS（47 files / 185 tests）
pnpm --filter web build      PASS
git diff --check（目标文件） PASS
```

新增契约覆盖正式 V2 搜索表单、GET keyword、URL 恢复、顶部搜索入口、帮助入口、真实通知组件和过期请求保护。

## 真实浏览器回归

在本机真实会话中完成：

1. 打开 `/projects?focus=search`：搜索框可见并可输入，显示 17 个真实项目。
2. 查询 `成员分工-20260724-1006`：URL 写入编码后的 `keyword`，显示 1 个匹配项目。
3. 刷新筛选 URL：关键字、1 个结果和项目卡保持，没有“真实数据暂时不可用”。
4. 点击清除：URL 回到 `?focus=search`，恢复 17 个项目。
5. 点击顶部搜索入口：聚焦正式搜索输入框，不再只是跳到页面顶部。
6. 通知中心：真实展开/关闭，`aria-expanded` 正确变化。
7. 帮助：进入 `/guide`，后退后返回搜索页。
8. 账号菜单：显示当前用户和“退出登录”，可关闭。
9. 浏览器 console error：0。

服务端访问证据：

```text
GET /api/v2/projects?view=all&page=1&pageSize=50&keyword=...  200
GET /api/v2/projects?view=all&page=1&pageSize=50              200
GET /guide                                                    200
```

筛选刷新时出现的无关键字请求 `499` 是客户端主动取消的过期请求；最新带关键字请求返回 200，且旧请求不再污染页面状态。

## 证据

- `docs/product/evidence/R26_PROJECT_SEARCH_FIX_20260807/projects-search-filtered.png`
- `docs/product/evidence/R26_PROJECT_SEARCH_FIX_20260807/projects-search-regression.png`

## 当前状态

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

本轮未提交、未推送、未部署 staging/production、未移动 main、未创建 tag。
