# R26 Gate 1 人工检查修复报告

## 当前决定

```text
R26_GATE1_PRODUCT_OWNER_ACCEPTED / STATIC_V2_ONLY / MAIN_MERGE_AND_PRODUCTION_DEPLOY_AUTHORIZED / GATE2_NOT_STARTED
```

本报告记录 2026-07-23 人工检查发现的问题、对应修复和复验证据。产品负责人随后明确回复“先就这样，部署提交合并代码”，接受当前结果并授权合并与生产部署；Gate 2 真实数据联调仍未启动。

## 问题与修复

| 人工检查发现 | 修复结果 | 回归门禁 |
| --- | --- | --- |
| 第 12 步文字离开菱形 | 元信息、标题和轮次结论全部改为菱形中心对齐，垂直间距重新分配 | 逐个 SVG 文本边界必须落在菱形外接边界内 |
| 节点文字行距过小 | 普通节点标题行距调整为 20，判断节点三层信息使用独立纵向位置 | 第 12 步截图人工复核 + SVG 边界断言 |
| 箭头和连线过粗 | 连线缩至 `2.5`，箭头改用 `markerUnits="userSpaceOnUse"` 固定尺寸 | 计算样式线宽 `≤ 2.5`，marker 单位固定 |
| 1024 抽屉挤压地图 | 详情抽屉收敛为 370px；SVG 保持 1440×1740 固定画布，不再整体缩小 | 画布实际宽度 `≥ 1439px`，抽屉 `≤ 371px` |
| 390 机械缩小桌面 SVG | 手机端隐藏桌面 SVG，改为 18 节点可读总览；节点点击进入全屏 sheet | 总览可见、桌面地图隐藏、18 节点存在、全屏详情可关闭 |
| 390 工作台主按钮不在首屏 | 移动端信息顺序改为任务结论 → 主按钮 → 事实卡 | 主按钮边界不得超出任务卡，底边必须位于底部导航上方 |
| 项目筛选与冻结口径不一致 | 固定为全部、正常、有风险、已逾期、等待评审 | 精确文案与风险项目数量断言 |
| 提交后节点/材料/动态不一致 | 第 06 步完成；第 07、09、10 步标记已创建；第 10 步进行中；材料同步 3/3 | 跨页状态、材料完整性和单条动态幂等断言 |
| 页面出现内部项目/任务 ID | 删除 `demo-r26 · t006` 产品可见内容，并加入禁用文案门禁 | 四页全文禁用文案扫描 |
| 开发调试徽标进入截图 | 关闭 Next 开发环境角标 | 新截图中不再出现左下角调试徽标 |

## 真实交互复验

- 浏览器真实执行了工作台滚动、项目风险筛选、打开异常项目。
- 点击第 12 步后，详情先显示结论；详情可滚动；刷新恢复 `taskId=t012` 和选中节点；关闭后 URL 恢复为项目根路由。
- 真实完成三步进展流程，用时 33 秒；选择“存在阻塞”时条件字段出现，切换“没有阻塞”后收敛。
- Playwright 真实选择 `到货确认记录.pdf` 并提交，随后验证第 06、07、09、10 步、材料 3/3 和最近动态同步。
- 同一提交不会重复写最近动态。
- 四页没有发出 `/api/` 请求，console error 和 page error 均为 0。

## 自动化与仓库检查

```text
R26 Playwright                                          PASS（7/7）
pnpm install                                            PASS
pnpm lint                                               PASS
pnpm typecheck                                          PASS
pnpm test                                               PASS（Web 84 / API 223）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true pnpm --filter web build PASS
pnpm --filter api build                                 PASS
pnpm --filter api prisma:validate                       PASS
git diff --check                                        PASS
```

Playwright 使用本机 Google Chrome 运行；首次默认启动因本机缺少 Playwright headless Chromium 缓存而未进入产品测试，随后使用已安装 Chrome 完整重跑 7/7 通过。

## 证据

- 索引：`docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- 人工勾选表：`docs/product/R26_GATE1_HUMAN_REVIEW.md`
- 截图：`test-results/r26-gate1/screenshots/`
- 录像：`test-results/r26-gate1/videos/`
- HTML 报告：`test-results/r26-gate1/reports/playwright-report/index.html`

## 未执行

```text
Gate 2                NOT STARTED
真实 API 联调          NOT RUN
staging deploy        NOT RUN
production deploy     NOT RUN
main merge            NOT RUN
commit/tag/push        NOT RUN
```

产品负责人已接受当前结果并授权提交、合并和部署。部署后仍需记录生产版本与 `/v2/*` 生产证据。
