# A2 合成原生账号业务验收（2026-09-17）

本目录记录实际本机隔离验证，**不是生产部署、最终候选镜像、离线或异机恢复通过声明**。源码基线 `c33c1bdd93639bdb01f584ea78c71ba90a838f9d`；HTTP API 运行 `6c70a897ec7643f4681616d801481765aaa8f7bc`；首次安装目录由正式 CLI 的 `1d8ff6d41e71fb202ef433c58c458c355a3dca2e` 提供。没有默认 seed、演示账号或 mock 登录。身份、服务和工具详情见 `actual-test-summary.json`。

## 实际结果

- `business-auth-result.json`：注册和岗位意向没有权限；管理员授予正式采购/工艺/查看角色；停用再启用不复活旧会话；改密、管理员恢复码单次消费及旧会话失效；最后原生管理员恢复、停用、降权被拒。
- `business-identity-result.json`：管理员将合成查看者改成与管理员相同显示名，并修改登录名；内部 ID 和原权限保持，旧登录名失效，大小写规范化只登录原账号；同显示名不能冒领管理员；`userId`、`feishuOpenId`、`authVersion` 注册注入被 DTO 拒绝。系统没有独立别名模型；此处验证真实存在的显示名、登录名与内部 ID 边界。
- `business-projects-result.json`：创建/重复提交、成员增加/移除/恢复、项目和任务多个正式路由、附件列表、导出及管理 API 的跨项目和跨用户拒绝。新命令真实落库及幂等重放。
- `business-attachments-result.json`：正常 PNG 由真实 ClamAV 扫描为 CLEAN，下载字节摘要对应，附件多个入口和跨项目绑定拒绝。合法 DOCX 容器内 EICAR 测试字符串触发 **422 + REJECTED + clamav + MALWARE_FOUND**。停止本任务扫描容器时新上传为 **503 + SCAN_ERROR/SCANNER_UNAVAILABLE**，不能下载，原生登录仍可用。扫描器随后恢复，流程图片验证完成后为最终构建释放内存而停止。
- `business-workflow-before-log-route-correction.json` 保存实际完整请求：新项目 C 的立项→工艺报告→调漆→样板 RETURN→第二轮调漆重提→实扫样板图→APPROVE→采购完成→首台份计划。采购不能操作工艺任务，工艺不能操作采购任务。通知归属拒绝、已读重复操作只产生一条审计、样板历史作者和前后记录均已实库验证。`business-workflow-result.json` 补上正式 `/projects/:projectId/logs` 读取，并明确复用同次已完成动作，未伪造再次执行。
- `business-rates-result.json`：真实 HTTP/Redis 注册预算返回 429 且未增用户；31 次有界错误登录中 21 次被 429 拒绝。
- `business-readback-result.json` 与 `synthetic-checkpoints-and-snapshot.json`：最终原生登录读取、3 个合成项目、16 个任务、6 个附件、通知及审计关系快照。快照只保留合成业务字段，不含密码、凭据、Cookie 或环境文件。
- 既有测试实际执行：原生 PG/限流/密码/项目权限/Redis 5 文件 28 测试，项目创建及附件配额真实 PG 2 文件 7 测试，全部 PASS、0 SKIPPED；原生 HTTP 32 请求 PASS。PG 业务测试的部分协作者使用 mock，不替代以上真实 HTTP。
- `native-migration-result.json`：旧表到原生账号迁移及备份关系验证；保留旧内部 ID、作者、项目/任务/评审/附件元数据引用。其范围不包含附件字节或异机恢复。

## 如实保留的纠错与语义观察

以下中间失败及弱断言不计为最终通过：

1. 原项目 A 的样板 `REJECT` 保留 REJECT 记录并结束活动链；现有 `WorkflowsService.resolveNextTaskTemplates` 对没有配置的非 RETURN 返回空后继，只有 RETURN 才走默认退回节点。最初脚本错误期待 REJECT 自动生成调漆重提；没有改业务、任务或审计来满足脚本。原观察保留于 `business-reject-observation-with-no-resubmit-contract.json`；另建 C 验证已有 RETURN 合同。
2. 旧通用 `/workflows/tasks/:id/submit` 已退役并固定返回 400；权限负向改用真实在用 `/start`，实际 403。旧文件 `business-projects-before-contract-correction.json` 仍保留。
3. 正常附件 HTTP 序列化没有 scanner/checksum 内部字段；改为实际 Prisma 只读事实证明，没有删除扫描条件。原失败存于 `business-attachments-before-response-contract-correction.json`。
4. `business-attachments-eicar-txt-validation-only-not-antivirus-evidence.json` 中 `.txt` 的 400 仅是文件类型拒绝，**不能证明恶意文件扫描**。其中 `real-eicar-rejected-no-clean-release` 检查已明确废弃；随后使用合法 DOCX 实际获得 422 和恶意扫描落库结果。早期 scanner outage 的弱空数组断言也废弃，最终严格断言必须存在 SCAN_ERROR 行。
5. 流程最后读取错写为 `/activity-logs?...` 导致 404；已按正式控制器 `/projects/:projectId/logs` 修正并实读 200。之前成功写操作通过检查点记录为 `REUSED_SAME_SYNTHETIC_RUN`，不是新的执行次数。

## 执行入口与前提

`native-business-setup.py` 仅用于这一组固定名称、purpose 标签和端口的合成 A2 环境，拒绝覆盖已有目录/容器；它不是便携部署工具。实际准备顺序为：已有缓存镜像→新 PG/Redis→迁移→正式 fresh catalog CLI→native-account initialize→扫描服务→业务脚本。首次 create 的本地/生产配置和期望镜像身份缺失被安全配置拒绝；恢复函数仅用于记录的、尚未有用户的已退出合成 API，预校验后重建。最终 helper 已包含正确 staging 配置、镜像身份和配额。

Docker Desktop 的 internal bridge 不支持本次 loopback 发布访问，实际另加只供此组容器的标准 bridge；因此**本轮不证明断网**。固定入口 API `http://127.0.0.1:3351`，Origin `http://127.0.0.1:3350`；PG `127.0.0.1:55439`、Redis `127.0.0.1:56389`。API 为 production/staging、Secure/HttpOnly/SameSite Cookie，测试只对合成 loopback 显式发送 Cookie。

扫描容器使用缓存 `timeline-clamav-candidate:r3`、2GB 上限、`native-clamd.conf` 加 TCP 3310、官方只读 CVD 副本。原签名材料来自已独立 `sigtool` 验真的 `/private/tmp/timeline-portable-signatures-20260917/verified`；本次副本在受保护任务目录。daily 28125，签名时间 2026-09-16T06:24Z；保持 48h 策略。代码本身不下载签名或偷偷联网修复环境。

```sh
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs auth
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs projects
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs identity
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs attachments
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs workflow
NATIVE_BUSINESS_TEST_CONFIRM=synthetic-only-20260917 node scripts/testing/native-business-acceptance.mjs readback
```

既有 `native-auth-http-test.mjs` 在 A2 的 auth 注册之后运行；`rates` 依赖本次已用完的注册预算，应在其他测试之后运行，不是独立清空数据库测试。集成测试数据库必须为独立新 `native_auth_test_<8 hex>`，不能使用 HTTP 业务库，且只能端口 55439。详见相应脚本的硬目标守卫。固定 A2 资源保留，未删除旧 20260912 容器，也未接触其他应用。

## 供独立 A/B 恢复复用（本目录尚未验证该分支）

使用 `NATIVE_BUSINESS_TEST_MANIFEST` 指向 `/private/tmp/` 或 Linux `/tmp/` 内 0600、当前用户所有、非符号链接 manifest；manifest 指定 `syntheticOnly: true`、`purpose: timeline-portable-isolated`、随机 `timeline-portable-<12 hex>` 实例、API 容器名/镜像 ID、`database: timeline`、精确运行 commit、CA 文件、独立 0600 密码文件、`username: portable-admin`。A 仅批准 `https://localhost:3450`，B 为 `https://localhost:3452` 或 `https://localhost:9444`。必须以 `NODE_EXTRA_CA_CERTS` 注入交付 CA，不关闭 TLS 验证。API 还必须实际具备目的和实例标签、关闭 mock、无第三方身份凭据并使用真实 Clam 48h 策略。

A 运行上列模式，用真实账号和业务产生源数据；冻结备份前最后运行 readback。`business-state.json` **含合成密码**，只通过受保护材料复制到 B 的 manifest 同目录，绝不提交 Git/普通证据/软件包。B 仅运行 `restore`：原密码重新登录、ID与角色、项目/任务/作者/附件/审计代表性快照、文件摘要和越权拒绝匹配，然后新写一个合成项目并重读。不在 B 注册、seed 或初始化管理员。全量表/对象、会话撤销、独立断网、重启/二次恢复仍由工作包 C 另证。
