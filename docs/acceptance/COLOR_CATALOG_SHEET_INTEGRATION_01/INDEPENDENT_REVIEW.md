# 颜色清单接入 · 独立只读审查记录

范围：基线 `218dbc2b73b3f946fee239b340d3aba6e382029c` 起的颜色清单连接、批量保存、Univer 适配、Excel 交换及直接依赖补丁。审查上下文为本任务三个独立只读子任务；仅主任务修改工作树。没有访问生产、上传源码到其他服务，不能替代产品负责人确认或全仓安全结论。

## 后端与保存

- 独立上下文 `inspect_backend` 复核字段白名单、已有 project.write 权限、团队批准、LISTED 标准更正限制、排序行锁、CAS、原子审计和幂等收据，未发现其他确定阻断。历史来源/技术数据、颜色 ID、项目关系不因普通保存被改写。
- 最终复核指出未知响应重放遇到 401/403 不能推断原请求未提交，因为权限检查先于幂等结果查询。`509f98595a9e2e7e0d7b3e9587aef47b8e2490d7` 保留此时的原操作标识、原请求及用户后续输入；404 同样保守保留。独立上下文已确认代码修复该路径。浏览器证据另列，审查者没有运行浏览器。
- 允许的文本长度、导入和 API 约束已对齐；标准更正原因必填。拒绝普通修改正式编号、生产基地、状态和流程事实。

## Excel 归档边界

独立上下文 `inspect_validation` 在候选 `1cda5f3e8311559ba3623429f639343b154a0e2b` 发现：仅信任 ZIP 声明展开长度并用固定缓冲解压可遗漏真实超量输出。`ad8772e48c0137b20d61407edfaf6488cab3c9e6` 改为逐块解压、累计实际输出预算、长度/CRC 校验，再将已验证内容交给 ExcelJS。新增伪造长度回归；后续只读复核确认原路径已修正，不代表任意 XLSX 或整个应用已获得安全许可。

按根规则第 9 节保留 **Finding Ledger 导入建议**：建议将该本轮回归导入唯一 `docs/security/FINDINGS.yaml`，候选 ID `R28-COLOR-SHEET-001`，CWE-400，中等严重度，高置信度，归属 `features/color-register/sheet-exchange.ts`；证据为 `sheet-exchange.zip-length.test.ts`、`var/color-sheet-runtime/web-test-browser-fix.log` 及上述固定修复提交。本文件不建立第二套 Finding 状态，也不关闭历史 Finding。

## 编辑器与样式

- `locate_sheets` 与 `inspect_backend` 复核真实 1.0.4 包源码。必须保留完整 CorePreset；早期仅补 DI 的建议被浏览器证据证明不足，普通文本编辑器依赖公式 UI 动态注册，最终恢复预设并在命令/单元格/派生结果层禁止公式业务写入。
- UI、engine-render、sonner 的三份固定补丁在动态样式进入 document 前复制本页 script nonce，Radix 使用 get-nonce。未改 middleware 或放宽 CSP；实际 CSP 正向/负向结果单列。
- sheets-ui 第四份补丁仅让原生单格纯文本粘贴遵守已有 `@` 格式，避免 `2026-10` 转为序列数。ESM/CJS 提案检查和 22 项真实解析器方法检查通过；最终仍以浏览器剪贴板结果为准。
- 紧凑 ribbonType=simple 是包的真实配置。隐藏 11 个公式分类的实际菜单 ID，保留文本编辑所需插件。
- 最初只将 SelectionChanged 的范围改为 getActiveCell 仍失败。进一步复核发现 1.0.4 的 UI 事件桥从 renderer 查找全局服务，异常被吞掉，根本没有注册选区事件。最终 702dbd7bfaa12a9844cf160d3512dbac68acc09f 使用公开 workbook.onSelectionChange 直接订阅全局服务，读取同一 primary；程序初始化 selectCell 后主动通知。独立源码确认先写状态再发事件，浏览器需在原失败地址复测。
- 原生撤销/重做被转换为业务历史，成功后的反向写入仍带当前版本；结构变化、通用快照覆盖和派生公式值均不进入业务保存。

- 最终 `5bc1d10e5aea498612d63fd7637107282af7b040` 复核：桌面共享菜单使用 `ui.operation.activate-format-painter` / `ui.operation.continuous-format-painter`，已同时隐藏并拒绝激活，取消命令保留。真实浏览器断言格式刷按钮不存在。字段映射、导入边界、状态限制和批量策略再次只读对照无新阻断；早期引用旧制品的启动命令由最终文档统一修正。

## 审查边界

本报告只说明有界差异及具体修正。真实浏览器、不可变制品身份、数据库只读对照与测试结果在 DELIVERY.md 记录；普通 Excel 仅映射预览、每次至多读取 500 条、未持久化个人视图等限制不隐去。Safari、原生 Excel/WPS 及生产域名未在本轮验证。
