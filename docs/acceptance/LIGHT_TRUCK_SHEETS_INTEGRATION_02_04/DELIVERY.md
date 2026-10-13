# LIGHT_TRUCK_SHEETS_INTEGRATION_02_04

状态：实施与验收进行中，尚未宣称交付。

实际业务项目：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree`。原 Personal Sheets：`/Users/lixiaochen/Documents/ChatGPT/在线表格`（仅源码读取）。共用工作区为 `apps/web/src/features/business-sheet`，Univer 固定 1.0.4；颜色/人员/检验/产量分别提供业务适配，未替换引擎。

本地计划入口 `http://127.0.0.1:3380`；原3370和线上站点保持不变。真实数据库事实来自 Color/ColorStandardVersion、PersonProfile与关联User、InspectionActivity/Object/Occurrence/Measurement/Reading/Defect、ColorProductionFact。工作簿不覆盖业务事实。

记录以 ID 与版本保存；新增取得服务器 ID；导入先预览身份/只读/空值/图片归属，再按50条批次保存。来源哈希与行保留。PNG/JPEG经现有鉴权、配额、隔离扫描和完整解码后以SheetImage绑定记录；原件只存对象目录，列表和表格使用受控缩略图。导出含真实图片字节及隐藏归属元数据。特殊图片对象明确提示，不能当成成功导入。

运行和验证、字段限制、实际性能和所有最终状态将由后续证据提交补充。
