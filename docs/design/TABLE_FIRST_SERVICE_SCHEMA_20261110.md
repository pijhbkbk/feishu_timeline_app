# 表格优先第二阶段：最小增量与兼容方案

2026-11-10，实施前方案。UI固定于21b9a755931a27d7514518f3c03cf5f254e92f08；原截图/交互和组件保留。源Excel读取精确Downloads路径，11表逐表核对，SHA256为34ab4145cc004c7b712bf5431b9f169d2e6f0e3d8b8922a389e722d264c836e7。与上一轮Desktop原件本轮实算逐字节相同，无历史导入。

## 目视增量

- InspectionObject.productionDate：DateTime? @db.Date。生产日期按date-only序列化，旧对象NULL；更正须对象revision，并保留审计，不能静默更新其他台次车辆信息。
- InspectionOccurrence.visualScores：Json?。NULL为旧记录未采集；新目视记录严格4项，ordinal为1–4，values按驾驶室/前围侧板/前围面板/保险杠/导流罩固定次序，各值仅NULL/A/B/C/D/原斜线。顺序不代表评委或测点，不自动汇总。
- InspectionOccurrence.manualRectification：Boolean?。人工是/否/未判定，与overallConclusion/visualConclusion独立，无自动阈值。
- InspectionOccurrence.rectificationDueDate：DateTime? @db.Date；paintUnit/responsibleUnit/rectificationUnit：可空有界文本。
- 原结论复用visualConclusion，整改说明复用handlingOpinion；原始来源复用originalSource。原measurement/reading不改写、旧是/否不转换ABCD、历史无评分不补A。

迁移仅ADD nullable列，无UPDATE回填、DROP、重建或数据清理。只在隔离库运行。原作者、外键、activity/occurrence/object ID和版本保持，旧入口省略新增字段时不得清空这些字段。应用回退旧代码时新增列保留，不自动执行破坏性down migration。

## 入口与事务

新增目视台账服务端适配：一次保存内部原子创建activity/object/occurrence，用户无需事先建活动。修改复用team授权锁、activity锁/正式提交锁、CAS、operationId请求哈希重放及auditLog。所有层级在同一事务；不能伪造仪器测点或自动提交正式评审。已有明确project关联继续原访问校验。

产量复用production-facts/batch及统计口径服务，矩阵只做视图映射。单格必须保留colorId/baseId/month/事实ID/revision/当前唯一basis；空白为NULL，0为0。车型依据或口径冲突格禁止直接写成月总量，按需进入既有口径处理。对本阶段新写路径补口径快照并发核对，避免只验事实revision漏掉依据变更。

附件沿既有sheet-images接口、quarantine/scan/业务目标鉴权；不伪造CLEAN或绑定本地预览图片。新增普通账号必须经过正常注册、准入与会话。

## 验证与发布边界

先服务器读取，再写入。两账号、3×3、两车四评分、刷新/重登录、冲突保留输入、扫描及业务关联均需GUI+真实请求/DB读回。单测/静态构建不计实际完成。独立差异审查尚待取得，不新增Agent；不以自审代替独审。生产及正式发布不在本轮授权内。
