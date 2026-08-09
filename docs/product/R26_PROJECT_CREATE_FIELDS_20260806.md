# R26 新建项目字段收敛（2026-08-06）

## 产品要求

- 正式新建项目页面不再要求用户填写“项目编号”。
- 移除“市场”。
- 增加文字字段“颜色营销单位”。
- 增加受控选项“涂料供应商”，仅允许：巴斯夫、立邦、艾仕得、金力泰、阿克苏诺贝尔、兰陵化工。

## 实现口径

- 项目内部编号仍作为数据库唯一业务键保留，但在创建请求缺省时由服务端生成，格式为
  `PRJ-YYYYMMDD-XXXXXXXX`，不再由用户输入。
- `marketRegion` 仅为历史 API 兼容保留，正式新建/编辑表单不再展示或提交。
- `colorMarketingUnit` 与 `paintSupplier` 进入 Prisma `Project` 模型、创建/编辑命令、项目列表、
  项目详情和审计快照。
- `paintSupplier` 同时在 DTO 和 Service 白名单校验，前端无法通过绕过下拉框写入其他值。
- 数据库变更由 migration
  `20260806083000_add_project_marketing_unit_and_paint_supplier` 提供，未直接修改数据库表。

## 自动化结果

```text
pnpm install                                                    PASS
pnpm lint                                                       PASS
pnpm typecheck                                                  PASS
pnpm test                                                       PASS（Web 180 / API 328）
pnpm --filter @feishu-timeline/web build                        PASS
pnpm --filter @feishu-timeline/api build                        PASS
pnpm --filter @feishu-timeline/api prisma:validate              PASS
project-editor.contract.test.ts                                 PASS（2）
projects.service.spec.ts                                        PASS（2）
```

## 环境状态

- 本地 Docker 数据库已应用 migration
  `20260806083000_add_project_marketing_unit_and_paint_supplier`；公网 staging 和 production
  均未应用本轮 migration。
- 本地 Web/API 以未提交工作树构建，仅用于 `http://localhost:8080/projects/new` 验证，
  不满足不可变 commit 部署定义：
  - Web：`feishu-timeline-web:local-project-suppliers-six-20260806`
    （digest `sha256:6ec401afaa8c9a91eb433e4cf7601f20c43176f3c8195f3b1f01b63618277c46`）
  - API：`feishu-timeline-api:local-project-suppliers-six-20260806`
    （digest `sha256:19383a378f88dd3f21188ac8c2a795477920d148ebd8517751eef9bec9facf50`）
- 真实浏览器确认“项目编号”和“市场”均不存在；“颜色营销单位”输入正常；“涂料供应商”
  仅包含巴斯夫、立邦、艾仕得、金力泰、阿克苏诺贝尔、兰陵化工；console error 为 `0`。
- 本地截图：
  `docs/product/evidence/R26_PROJECT_CREATE_FIELDS_20260806/projects-new-six-suppliers-local.jpg`。
- 未提交、未推送、未合并 main、未创建 tag、未部署 production。
- 产品状态：`AWAITING_PRODUCT_OWNER_CONFIRMATION`。
