# R26 公司部门所属事业部固定清单

日期：2026-08-05

## 产品规则

“所属事业部”只有以下六个可选值，顺序固定：

1. 技术中心
2. 商用车营销事业部
3. 乘用车营销事业部
4. 制造中心
5. 国际事业部
6. 采购中心

## 本机真实页面复核

- URL：`http://localhost:8080/admin/organization`
- 账号：李晓晨
- 路径：公司部门 → 项目管理部 → 编辑部门
- 实际结果：必选提示“请选择所属事业部”处于选中状态，其后仅显示上述六项。
- 历史值处理：项目管理部原归属“总部”未出现在候选项中，也未自动误选“技术中心”。
- 数据库结果：六项参考组织均启用、均为顶层记录，编码分别以 `BU_` 开头。
- 服务端结果：预校验和正式写事务同时拒绝清单外、缺失或停用的事业部。

## 环境边界

- 本轮只在本机 Docker staging 验证。
- `runtimeCommit=unknown`，因此本记录不将本机构建声明为可追溯的 `STAGING_DEPLOYED`。
- production、main、tag 均未改变，等待产品负责人复核。

## 验证结果

```text
pnpm install                         PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 45 files / 177 tests；API 69 files / 318 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
target route Placeholder             0
```
