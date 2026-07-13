# R22 Design Tokens

> 视觉源头：`轻卡定制色开发系统_Apple风产品UI设计稿.pptx` 第 2 页。本文件记录 Gate 1 已落地的 Web token 与组件口径。

## 基础 token

| 类别 | 值 |
|---|---|
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif` |
| 页面背景 | `#F5F5F7` |
| 卡片背景 | `#FFFFFF` |
| 一级文字 | `#1D1D1F` |
| 二级文字 | `#5E6470` |
| 弱化文字 | `#868E9C` |
| 边框 | `#E2E5E9` |
| 主品牌蓝 | `#315F86` |
| 按钮悬停 | `#274D6D` |
| 浅蓝背景 | `#EAF1F7` |
| 完成 / 进行中 / 待评审 / 逾期 | `#367A54` / `#3D6F9D` / `#B27A21` / `#B94C4C` |
| 卡片 | `20px` 圆角，`24–28px` 内边距，`0 8px 30px rgba(30,44,58,.06)` |
| 页面容器 | 最大 `1440px`；桌面 / 平板 / 手机横向边距 `48 / 32 / 20px` |

正文基准为 `16px / 1.6`，页面主标题为 `36–40px`，模块标题为 `24–28px`。`12–13px` 只用于时间、标签、角标和紧凑元数据，不承载主要业务信息。间距使用 `8 / 16 / 24 / 32 / 48 / 64px` 体系。

## 基础组件

- `R22Card`：统一卡片圆角、边框、留白和阴影。
- `R22StatusBadge`：品牌、完成、警告、逾期、月度、未开始六类文字化状态。
- `R22ProgressBar`：带可访问名称的真实百分比进度。
- `R22Kpi`：四项同级数字指标，颜色只强调状态，不铺满卡片。
- `R22TaskCard`：项目、工序、截止、材料、进度和唯一主动作。
- `.r22-button-*` / `.r22-icon-button`：最小点击区域 `44×44px`，主按钮高度 `48px`，键盘焦点可见。

组件实现位于 `apps/web/src/components/r22-ui.tsx`，token 和响应式规则位于 `apps/web/src/app/r22.css`。开发环境预览页为 `/dev/r22-components`，覆盖 Typography、Button、StatusBadge、Card、KPI、TaskCard、Empty、Error 和 Permission；非开发环境返回 404。

## 响应式

- `≥1440px`：完整桌面信息层级；项目工作区约 70/30 两栏。
- `1024–1439px`：导航收紧；项目流程图在上、工序详情在下；KPI 两列。
- `768–1023px`：主导航切换为底部五项导航；进展表单单列。
- `390–767px`：20px 页面边距；项目流程转纵向节点；进展三步条置顶、主动作固定在底部导航上方。

所有状态均有文字，不仅依靠颜色；表单具备 label；支持 `prefers-reduced-motion`。
