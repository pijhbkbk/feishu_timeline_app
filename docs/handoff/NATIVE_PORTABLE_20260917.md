# 原生账号与可携带恢复：当前续接

所有者于 2026-09-17 明确要求按 `NATIVE_AUTH_ACCEPTANCE_AND_PORTABLE_RECOVERY.md` 继续实施。三项结果分开：正式业务验收、离线运行、合成数据异机恢复。保留此前所有者“可以进入工作台”的登录路径确认，整个产品尚未验收。

## 现场与范围

- 原项目 main 为 `41b4b166c587692e6f0fb9536dca2e1aab646c70`；原 AGENTS/README/Ledger 修改及未跟踪用户媒体原样保留。未 reset、stash、clean 或 prune。
- 原临时开发 worktree 已不在磁盘；从仍可读取的 `codex/native-account-auth` 提交 `c33c1bdd93639bdb01f584ea78c71ba90a838f9d` 独立 clone 到 `/private/tmp/timeline-native-portable-20260917`，分支 `codex/native-portable-recovery`。不是从 main 或旧候选重新实现。
- 2026-09-17 正式 HTTPS 的 Web/API 元数据仍为 `6c70a897ec7643f4681616d801481765aaa8f7bc`，release `native-auth-20260914-6c70a897ec76`。当前服务器 HEAD、worker、数据库与扫描进程未重新读取，旧运行证明仍仅代表旧检查时间。
- 本轮未开启云管理会话、修改生产、导出生产数据、改变 DNS、购买资源、改变 main/tag 或全局平台权限。

## 已执行与正在进行

- 正式域名独立原生登录会话：同一内部身份，`/api/v2/dashboard` 无当前任务且可见项目数 1，`/api/v2/projects?page=1&pageSize=1` total 1，全部 HTTP 200；已退出该会话。脱敏证明：`../acceptance/NATIVE_ACCOUNTS_20260912/dashboard-observation-20260917.json`。
- 真实浏览器也在正式 `/dashboard` 复现错误“当前还没有项目”，随后 `/projects` 可见原项目与 10/18 业务进度；临时浏览器会话已退出回原生登录页，读取的 console error/warn 为空。截图仅保存在本机私有证据目录，未将业务内容复制进 Git。
- 工作台修复提交 `d6004cd`：保留无待办空态及原创建/查看权限，停止从无待办推断无项目；未分配部门显示实际状态。项目数改为相同授权范围的 count，不读取全部 ID。UI 回归先 3 FAIL/4 PASS，再相关 27 PASS；计数回归先 1 FAIL/3 PASS，再相关 API 13 PASS。
- 已核对两处项目统计范围不同：个人工作台 owner/member/assignee，项目列表 owner/member/department；没有擅自扩大权限或据个人工作台计数声明整个列表为空。
- 依赖冻结安装经历大归档停滞；使用已有限时下载/锁文件完整性校验补 Next 和 Prisma 后，离线安装 388/388 成功。Prisma 客户端已生成；早先缺依赖/沙箱缓存失败不是测试 PASS。
- 独立 clone 并行实现新安装业务目录、合成原生 HTTP 验收、便携备份/恢复。新目录必须在空业务库、建账号之前执行；恢复不得执行，详见已有验收入口内的 `fresh-catalog-20260917.md`。
- 便携候选仍在独立安全审查和修正：真实受限数据库连接、签名验签与激活一致性、HTTP 客户端中断后的异步写入排空、软件包身份绑定等。未把未验证工具当作可交付恢复能力。

## 具体边界与下一步

- 自动审批拒绝移除 production 固定域名限制；该补丁未写入，未换工具绕过。当前便携配置只按既有允许的本地范围继续；任意新生产域名支持未验证。
- 同一 Docker daemon 的新卷演练与独立干净目标分开记录。正在准备仅本轮使用的本地独立虚拟机；没有凭新卷或镜像打包宣称异机恢复通过。
- 下一步：完成独立审查整改，集成准确候选并构建同版本镜像；合成账号/角色/业务/附件写入与越权负向；受保护备份→干净 B→断公网启动/登录/文件完整性/新写入/再备份恢复。生产更新须采用既有受控路径和精确候选，随后在正式 URL 复验。

当前：实现与验证进行中；staging 无已验收 URL/commit/path；production 本轮未改变；完整产品确认、离线交付、独立恢复均未完成。
