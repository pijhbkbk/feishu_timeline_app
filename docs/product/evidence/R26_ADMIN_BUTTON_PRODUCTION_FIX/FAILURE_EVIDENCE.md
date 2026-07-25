# R26 生产后台按钮失效：失败证据

## 原始失败环境

- 环境：production
- Host：`timeline.all-too-well.com`
- 原失败入口：`https://timeline.all-too-well.com/admin`
- 原失败路由：`/admin/users`、`/admin/roles`、`/admin/dicts`、
  `/admin/workflow-nodes`
- 记录时间：2026-07-25 21:29（Asia/Shanghai）
- 用户录屏：
  `/Users/lixiaochen/Desktop/录屏2026-07-25 下午9.29.53.mov`
- 录屏 SHA-256：
  `db22dfe7289753931bc5a0e9e74a13d449b3a7a2669b28f192ce893f227a8e11`

## 复现结果

录屏和生产 Safari 实际操作均证明：后台入口可以呈现点击反馈，但目标页面仍是旧版
`PagePlaceholder`。页面只显示标题、“页面入口已接入导航”和“已创建骨架”等文字，
没有真实表格、筛选、分页和受控管理动作，因此用户感知为“按钮点击后没有任何反应”。

## 生产运行事实

- 部署目录：`/opt/feishu_timeline_app`
- 故障时 server HEAD：
  `94d6fd01d8840416fb7154d302970d0a94a0c995`
- 故障时 `origin/main`：同上
- 预期后台真实实现基线：
  `a2296dd17c6e07f4214484360021afffb2dc09c7`
- 生产源文件仍引用：`PagePlaceholder`
- 生产缺少：
  - `apps/web/src/components/admin-control-center.tsx`
  - `apps/api/src/modules/admin/admin-control-center.controller.ts`
- Nginx upstream、systemd Web/API 和域名解析均正常。

结论：故障不是按钮事件冒泡或浏览器缓存问题，而是 production 实际运行了不包含真实
后台管理能力的旧提交。

## 修复门禁

本轮增加自动化门禁，生产验收必须同时证明：

1. API `/api/health` 的 `runtimeCommit` 等于候选提交；
2. Web `/build-info` 的 `runtimeCommit` 等于候选提交；
3. server HEAD 等于候选提交；
4. 正式后台路由引用 `AdminControlCenter`；
5. Web 与 API 的后台真实实现源文件存在；
6. 后台构建产物中的 Placeholder 命中数为 0。
