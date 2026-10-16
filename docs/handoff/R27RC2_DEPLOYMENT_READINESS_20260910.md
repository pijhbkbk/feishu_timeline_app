# R27RC2 部署准备续接（2026-09-10）

当前为 `LOCAL_VERIFIED / RELEASE_NOT_READY / AWAITING_PRODUCT_OWNER_CONFIRMATION`。
本轮补齐了受控恢复材料验证与 API 运维镜像的本地证据，没有部署任何环境。

## 起点与不可变身份

- 实际工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`，
  分支 `security/r27rc2-candidate-repair`。
- 起点 evidence HEAD：`a116c374c1603b1cd2d19f5a5d79a0a0f290eb56`，当时干净。
- 本轮恢复源码/测试 checkpoint：`defd47d80ca2cf9568a02c50c0acbfa89eff57e5`，
  tree `1ef3bfcd47746ed048c114dce31accb2476af72b`。仅四文件：恢复校验器、两个直接测试、
  `docs/RESTORE_REHEARSAL.md`。后续证据提交与此分开。
- API-ops 构建使用已有 source/test candidate
  `e0b20a69522edd4dc76ee3b3219badda7166acbd`，tree
  `fa64715929aed610ae2714482db0b881ba2f367d`；由 `git archive` 创建独立构建目录。
  本轮恢复工具不在该镜像中，不能混淆两份源码身份。
- lock SHA-256 保持 `5e7450da9c82bfe96390a9be4198ebc784e5e858e17c5fc5ed71ce33713e3f2c`。
- 只读远端观察：validation ref 为 `5a388095726d1b53fe79e379e1f3665d4a310a5d`；
  main 为 `41b4b166c587692e6f0fb9536dca2e1aab646c70`。没有 push 或 CI 新事件。
- 原 main 工作树及八月旧安全工作树未被用作修复起点；用户媒体未读取或处理。

## 已实现与验证

恢复校验器先验证外部固定 manifest 摘要、文件/对象清单、路径、链接与资源上限，再生成
私有快照。只用于可信执行人控制目录、无并发写者的小型受控演练，不处理真实数据库，
不提供 root 信任、SQL 安全保证或发布激活能力。

17 项单测通过。真实 PostgreSQL 演练使用缓存精确 image ID
`sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`
（linux/arm64），非 root、断网、只读根文件系统、临时文件系统、无宿主挂载或端口发布。
验证项目/审计/附件完整行、附件字节与外键；篡改 dump/object/manifest、损坏 catalog、非空
目标拒绝。只发生一次合法 restore，失败用例目标未改变。本轮容器和合成数据已清理。

独立只读审查 G4_DIFF PASS，17 项测试由审查者独立复跑。初审发现目录先全量读取再计数，
已改逐项读取并补 1025 项拒绝测试；同时完善测试失败清理。最终源码 SHA-256：

| 文件 | SHA-256 |
|---|---|
| verify-restore-inputs.mjs | `37d4cd9e26c457d45a9853191af889a1dc5c4fd022dd83b94cf72db52b4992e6` |
| verify-restore-inputs.test.mjs | `25d93dc917fbd185bb151f0f5aa780f4e635c85e1295ff9d3ea2ffa271242b5d` |
| restore-snapshot.integration.mjs | `e9a32d0d9eba7b6099676dc1e7a1846016abb8b58935fbf2639e9922dffe0860` |

固定 Semgrep 1.169.0、上一轮三份本地规则离线扫描：三个新增 mjs 均覆盖，0 findings / 0
errors。首次默认扫描跳过 tests，只证明主文件；最终在临时扫描目录使用空 ignore 扩大覆盖，
未改变正式规则/阈值。原报告与最终报告分别保留。

## API 运维镜像

- tag：`feishu-timeline-api-ops:readiness-e0b20a69522e`；Docker inspect Id：
  `sha256:b0c6b3621c8e8d0271f2402225e33397a6246569360d244d6087c31281e718fa`。
  它是本地身份，未发布到 registry，不冒充已发布 repository digest。
- linux/amd64，宿主 Docker Desktop arm64；release `r27rc2-readiness-e0b20a69522e`，
  OCI buildTime `2026-09-10T12:00:00Z`；完整 source/tree labels 与候选一致。
- Prisma 6.19.3、Node v24.19.0，Node SHA
  `ce98bfa82b8d7ba6e426c051eb5d82ec8d1fbafaf2905996285abc0c5b82cbaa`。
  内嵌 OpenSSL 仍 3.5.7，不声明已打补丁，也不将 API/Web 适用性结论自动扩展为所有 ops
  执行路径的完整安全结论。
- 固定 Trivy 0.72.0 镜像扫描通过：0 漏洞条目。实际库 UpdatedAt
  `2026-09-10T07:06:15.043595671Z`，NextUpdate `2026-09-11T07:06:15.04359539Z`；
  trivy.db SHA `7459b4bbf88aff3fd156d8d4cc5797f8a568cd066cfe8cb8ee78eea1e55e381e`。
- 新 ops 镜像在断网隔离 PostgreSQL namespace 实际执行 validate、全部36项 migrate deploy、
  第二次 deploy 和 status。36项 checksum 与原 migration 文件完全一致，均 finished；
  第二次无待应用迁移，Reviews 索引有效且列顺序正确。未连接真实库。
- 首次核对 SQL 将混合大小写索引名作为未引用 regclass，导致只读核对失败；迁移实际成功。
  修正名称核对后在新隔离库重跑通过，两轮日志分别保留，未改 migration。

## 本地质量与证据

`pnpm install --frozen-lockfile`、lint、typecheck、test、Web/API build、Prisma validate、
17项恢复单测、18项manifest回归和部署安全脚本均 exit 0。Web 287 PASS；API 1280 PASS /
30 SKIPPED（默认未启用三组数据库测试），不将跳过记录写成全量实库 PASS。应用代码未改，
此前相应实库回归按绑定复用；本轮恢复和36项迁移为单独真实执行结果。

Placeholder 扫描 raw 10，均为既有白名单测试或 `getByPlaceholder`，正式产品页面命中0。
没有本轮路由变更或新页面验收。依赖、schema、历史 migration、CI、Dockerfile、
Findings 生命周期和全部禁用部署入口保持不变；没有风险接受或新 closed 结论。

持久本机证据：`test-results/r27rc2/deployment-readiness-20260910/`，包含质量命令/退出码、
失败与最终日志、镜像/漏洞库身份、两次迁移、独立审查摘要及逐文件 hash 索引。原始证据
不提交、不上传。八月交接入口已加最新位置提示，避免下次从过期旧树重复修复。

已按用户授权向账号的 GPT-6 Pro 咨询通用部署工程问题，收到完整建议。首次带内部项目
身份的咨询被自动审批拒绝，未执行；后改为不含项目身份/内部资料的通用问题成功发送。
AI建议仅作技术参考，不代替所有者公开发布授权、目标平台或产品确认。

## 剩余条件与具体下一步

1. 新候选 e0b20a69 的既有 validation ref 正常 FF 和第二次 CI：精确公开推送请求已提交，
   本轮尚未收到批准；没有复用已用尽的旧推送授权。本轮 defd47d 恢复检查点不夹带进入该
   e0b20a69 请求；它需要后续适用的远端验证。
2. 需要精确预发布 HTTPS URL、目标OS/CPU、执行入口、registry与独立数据库/Redis/对象
   存储/飞书测试应用配置的受控位置（不能在聊天粘贴秘密）。没有这些信息，不选择生产
   主机或默认使用开发机架构，也不输出完整六镜像 manifest PASS。
3. 需按该平台完成 PostgreSQL/Redis/Nginx 与实际外部扫描服务的制品/配置核验，发布并
   验证不可变 digest；本轮仅补 API-ops，不冒称完整制品集合通过。
4. 独立受信发布/恢复执行入口的实现、首次安装和权限，真实数据一致备份/RPO/RTO及
   Reviews 索引窗口尚需目标约束。恢复校验器只是局部补充，不可解除 exit78。
5. 指定环境的真实飞书、角色/主链路、附件 ClamAV clean/EICAR/error/timeout、资源与
   恢复一致性、精确域名浏览器及产品负责人确认尚未执行。

## 交付真相

| 必答项 | 本轮状态 |
|---|---|
| 1 代码是否实现 | 恢复校验与演练已实现并本地提交；完整发布/恢复控制器未实现 |
| 2 本地测试是否通过 | 上述质量与新增实库演练通过；30项常规数据库测试跳过，范围已分列 |
| 3 staging URL | 未指定/未访问；本轮断网容器无用户URL |
| 4 staging runtime commit | 未部署，无本轮值 |
| 5 staging 用户路径 | 未执行 |
| 6 production 是否改变 | 未改变 |
| 7 production runtime commit | 未读取；不沿用历史值冒充当前值 |
| 8 production 用户路径 | 未执行 |
| 9 main 是否改变 | ref与运行源码未改变；原main工作区仅追加交接指针，未提交 |
| 10 tag 是否改变 | 未改变 |
| 11 产品负责人确认 | AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 12 未完成路由 | 本轮无路由实现；所有目标环境验收尚未执行 |
| 13 Placeholder | 正式0；raw10既有测试白名单 |
| 14 准确状态 | LOCAL_VERIFIED / NOT_DEPLOYED / RELEASE_NOT_READY |
