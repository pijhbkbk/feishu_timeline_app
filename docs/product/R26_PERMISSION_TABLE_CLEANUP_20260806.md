# R26 角色权限表格清理（2026-08-06）

## 目标

- 移除角色名称下方的灰色角色编码和类型。
- 将最右侧“编辑”按钮固定为横排。
- 防止角色名称因列宽不足而逐字竖排。

## 实现

- `AdminControlCenter` 的桌面权限矩阵与移动端角色卡只渲染角色名称。
- 角色列固定为 148px，并使用 `white-space: nowrap`、`word-break: keep-all`。
- 操作列固定为 88px；编辑按钮使用 64×36px、`horizontal-tb`、`nowrap` 和 `keep-all`。
- 契约测试覆盖灰色辅助文字、角色名称换行规则与按钮横排规则。

## 验证

- 定向契约测试：17/17 PASS。
- Web build：PASS。
- 本轮完整仓库门禁：PASS。
- 本机 Docker Web：healthy，目标 URL HTTP 200。
- 最终补丁前的已登录页面验证：9 行角色、灰色角色小字 0、编辑按钮 64×36px 且横排。
- 最终容器重建后登录态失效，因此最终构建的签入态人工浏览器复核仍待产品负责人执行。

## 环境边界

- 本机地址：`http://localhost:8080/admin/permissions`。
- 本机 Web image：`feishu-timeline-web:local-permission-table-cleanup-20260806`。
- Image digest：`sha256:f9a99cd626df12529ba5b455799f373628bda8ba7bcf1cd6d84f40ce5a425573`。
- Runtime commit：`unknown`（包含未提交工作树变更）。
- Production：未改变。
- Git main / tag：未改变。

## 当前状态

`CODE_IMPLEMENTED / LOCAL_AUTOMATION_VERIFIED / LOCAL_DOCKER_STAGING_BUILT /
FINAL_SIGNED_IN_BROWSER_RECHECK_PENDING / AWAITING_PRODUCT_OWNER_CONFIRMATION`
