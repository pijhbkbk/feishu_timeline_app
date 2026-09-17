# 原生账号与可携带恢复：当前续接

所有者于 2026-09-17 明确要求按 `NATIVE_AUTH_ACCEPTANCE_AND_PORTABLE_RECOVERY.md` 继续实施。三项结果分开：正式业务验收、离线运行、合成数据异机恢复。保留此前所有者“可以进入工作台”的登录路径确认，整个产品尚未验收。

## 现场与范围

- 原项目 main 为 `41b4b166c587692e6f0fb9536dca2e1aab646c70`；原 AGENTS/README/Ledger 修改及未跟踪用户媒体原样保留。未 reset、stash、clean 或 prune。
- 原临时开发 worktree 已不在磁盘；从仍可读取的 `codex/native-account-auth` 提交 `c33c1bdd93639bdb01f584ea78c71ba90a838f9d` 独立 clone 到 `/private/tmp/timeline-native-portable-20260917`，分支 `codex/native-portable-recovery`。不是从 main 或旧候选重新实现。
- 2026-09-17 06:51:59Z 通过既有本机身份与严格主机密钥校验的 IAP 连接完成只读核实：正式 Web/API、运行镜像、干净服务器 checkout HEAD 与提交状态均为 `6c70a897ec7643f4681616d801481765aaa8f7bc`，没有 pending；应用、Redis、入口 active，Nginx upstream 正确。扫描为 ClamAV 1.4.6 / daily 28125（2026-09-16）。数据库业务数量本次未重新读取。
- 已将准备候选 `13131ee5425017b31ccf77741798a8dc37dbc936` 的源码分支及 API/Web 镜像上传本人现有私有 Git/镜像库；没有启动该版本。随后初始化工具出现实际问题并修复，因此 13131ee 包仅为预演材料，不是最终交付。生产运行、DNS、main/tag、其他应用及全局平台权限未改变，未导出生产数据、购买资源或创建 Cloud Shell 临时密钥。专属镜像上传认证目录已删除；保留用户原有云登录。

## 已执行与正在进行

- 正式域名独立原生登录会话：同一内部身份，`/api/v2/dashboard` 无当前任务且可见项目数 1，`/api/v2/projects?page=1&pageSize=1` total 1，全部 HTTP 200；已退出该会话。脱敏证明：`../acceptance/NATIVE_ACCOUNTS_20260912/dashboard-observation-20260917.json`。
- 真实浏览器也在正式 `/dashboard` 复现错误“当前还没有项目”，随后 `/projects` 可见原项目与 10/18 业务进度；临时浏览器会话已退出回原生登录页，读取的 console error/warn 为空。截图仅保存在本机私有证据目录，未将业务内容复制进 Git。
- 工作台修复提交 `d6004cd`：保留无待办空态及原创建/查看权限，停止从无待办推断无项目；未分配部门显示实际状态。项目数改为相同授权范围的 count，不读取全部 ID。UI 回归先 3 FAIL/4 PASS，再相关 27 PASS；计数回归先 1 FAIL/3 PASS，再相关 API 13 PASS。
- 已核对两处项目统计范围不同：个人工作台 owner/member/assignee，项目列表 owner/member/department；没有擅自扩大权限或据个人工作台计数声明整个列表为空。
- 依赖冻结安装经历大归档停滞；使用已有限时下载/锁文件完整性校验补 Next 和 Prisma 后，离线安装 388/388 成功。Prisma 客户端已生成；早先缺依赖/沙箱缓存失败不是测试 PASS。
- 独立 clone 并行实现新安装业务目录、合成原生 HTTP 验收、便携备份/恢复。新目录必须在空业务库、建账号之前执行；恢复不得执行，详见已有验收入口内的 `fresh-catalog-20260917.md`。
- 便携修复已覆盖真实受限数据库连接、HTTP 客户端中断后的异步写入排空、签名冻结验签/激活、软件包 tree/镜像绑定、PostgreSQL 强制密码认证与管理员查询 namespace。独立证据见 `../acceptance/NATIVE_A2_20260917/independent-review.md`；最终 namespace 复核为静态审查，不能冒充被平台拦截的动态实验 PASS。
- 13131ee 全套单元运行：Web 297 项 / 59 文件、API 1353 项 / 133 文件通过；另 60 项 / 6 文件 SKIPPED 单列。构建与类型/检查已通过。后续变更为便携工具、验收脚本及证据，应用/依赖未变；最终软件包仍须重建并执行真实链路。
- 合成原生验收已覆盖角色分配、停用、改密/恢复、会话撤销、最后管理员、跨项目拒绝、项目/代表性 RETURN 流程、真实附件与扫描故障；证据和先前失败明确保留于 `../acceptance/NATIVE_A2_20260917/README.md`。该次运行不是最终版本，也不是断网异机恢复。
- 预演 A2（`https://localhost:3450`）通过空库迁移/业务目录、修正后的真实管理员初始化、密码登录、项目写读、真实 PNG 扫描和下载；备份证明 API 正常退出且无 OOM。恢复逐表及序列一致，但 schema 因 PostgreSQL 同一 CHECK 内 AND 括号重组被拒绝；失败库保持 NOLOGIN，未报恢复通过。

## 具体边界与下一步

- 自动审批拒绝移除 production 固定域名限制；该补丁未写入，未换工具绕过。当前便携配置只按既有允许的本地范围继续；任意新生产域名支持未验证。
- 独立 B 已就绪：Lima 2.2.0 的 Ubuntu 24.04 arm64 VM，4 CPU / 6 GiB / 40 GiB、Docker 29.5.2 containerd store、Node 24.14.0 与 x86_64 用户态兼容层；没有宿主目录挂载、源码 checkout、Google 凭据或旧镜像缓存。首次证据为镜像 0、容器 0。VM 自身与容器转发公网出口均拒绝，公网、旧生产服务器、云元数据地址实测拒绝；专用 SSH 控制和 localhost:9444 保留。这是实际测试配置，不是最低资源承诺或任意平台兼容证明。
- B 仍未导入镜像或恢复数据，等待最终同版本软件包。预演同一 Docker daemon 的新目标不算独立 B。不得先装旧包填充缓存、不得将生产数据复制到 B。
- 自动审批曾拒绝新增 schema 摘要等价对，当时补丁未应用。独立静态检查完整 4,572 行确认只有一行括号重组；所有者随后明确回复“批准这一项精确例外”。当前只允许按已审阅方案增加 source `3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0` → restored `175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6` 的有方向组合；其他 schema、表/序列、对象、身份和权限校验保持。仍使用正常平台审批，不将用户批准解释为绕过平台限制。
- 最新补强已集成 `dc9d4c8`，独立审查 `1d433a6`：签名最低版本随 v2 加密备份保存，源/目标版本取最高；畸形/悬空链接拒绝；真实旧版本导入负向和 4 项单元通过。非空站内队列/去重的专用 Redis 编解码保留字节、绝对 TTL，重复任务拒绝；不冒充 B 消费成功。
- B 实际冷重启发现 Docker 会将放行链插到原 FORWARD hook 前；已通过固定主机/原文件摘要守卫，仅添加 DOCKER-USER hook，独立静态核对后再次冷重启。07:37:38Z 的真实主机出口检查通过且仍镜像 0/容器 0；B 已正常停止释放内存并保留磁盘，没有进行应用冷启动。
- 具体 schema 许可已收到所有者明确批准，原提案与完整两份 schema 保持原样存于主项目 `var/native-portable-delivery-20260917/evidence-preparatory/`；后续实施事实另记，不回写旧拒绝记录。v2 合成密文和恢复秘密分别在该根的 `backups-preparatory/`、`secrets-preparatory/`，目录 0700/文件 0600，不进入 Git、聊天或软件包。
- 已按控制命令停止本轮 11 个专用容器，保留卷和失败库；API 退出 0/无 OOM，TLS proxy 的退出 137/无 OOM 如实保留，不等同于所有进程优雅退出。v2 备份制作时 queue=0；其后非空队列留在已停止的 A2 卷中，最终测试须重新备份。现有本机任务源码分支与暂停的 Ops 分支已保存回原项目；Ops `9eb83f414597909e43bc351ac71791615c895b49` 仍绑定旧候选 13131ee，禁止执行，必须在最终冻结后重新固定镜像身份。
- 下一步：完成独立审查整改，集成准确候选并构建同版本镜像；合成账号/角色/业务/附件写入与越权负向；受保护备份→干净 B→断公网启动/登录/文件完整性/新写入/再备份恢复。生产更新须采用既有受控路径和精确候选，随后在正式 URL 复验。

## 最新覆盖状态：2026-09-17 08:25Z

以上为准备过程，以下是当前执行入口，不将旧失败改成通过。

- 所有者批准的单一有方向 schema 摘要对已通过正常工具审批实施，精确匹配、反向及其他数据差异拒绝共 5 项回归通过；独立静态复核完成。
- 最终不可变 runtime：`c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，tree `830e562f5ec56e99d7fc0b04432fc056dd772254`，buildTime `2026-09-17T08:04:51Z`，release `native-portable-20260917-c5aed415cd17`。API `sha256:40544930b329416679f24ebc6dd2354e24beaec9d8490b9edbdbda5e0f71d192`，Web `sha256:774419239cea09f8d341fd29ed34361b47012c720bafbe7a3a5ef0d60ffa187b`，Ops `sha256:bc47eab26f3de164a4cca805453b467fa88922944ca6bdae240a2a8bceda614f`，全部 linux/amd64。
- 三镜像最终构建完成。本人现有私有 Git 分支和 API/Web 私有 registry 已实际回读为 c5；专用上传认证目录已删除。应用/依赖/锁文件相对 13131ee 未变，相关全套检查按此依据复用；最终便携脚本及真实链路另行执行。
- 最终软件 `/private/tmp/timeline-portable-delivery-c5aed415cd17/software`，7 文件摘要、clean git archive、六镜像和 72 个 OCI blob 闭合已独立核对。`corresponding-source` 内 13131ee 仅为未变扫描器源码补充的历史采集来源，不能写成最终应用身份；已有说明文件。最终材料仍须持久保存到原项目私有 var。
- A3 `https://localhost:3450`、实例 `timeline-portable-bba6c545a4fd` 从最终包空库安装、业务目录及管理员初始化通过。auth/projects/identity/attachments/workflow/readback 六模式 253 请求通过，真实恶意附件拒绝、RETURN/重提/扫描/APPROVE/采购与后续工序通过。快照为 4 用户/3 项目/13 任务/3 附件/10 通知/94 审计，后续恢复边界专用合成账号另计。非敏感证据在交付根 `verification-A3`。
- 独立 B 首次加载最终包前仍镜像/容器 0；实际主机出口拒绝证明保留。冷重启清空 `/tmp` 内预置证书，导致一次 init 在建配置前失败，未创建业务库/用户。改用持久 guest home 后 init 和官方签名导入成功，未 seed/initialize；不得复用失败临时目录。
- B 持久目录 `/home/lixiaochen.guest/timeline-delivery-c5aed415cd17/instance`，实例 `timeline-portable-a3b3ea9b6993`，`https://localhost:9444`。08:24:42Z 六镜像明确 inspect 为最终 manifest，官方签名 floor 339/28125/63，尚无 install/restore 标记。A3 随后开始会话/未使用恢复码边界准备和加密备份。portable_recovery 当前独占 B 写操作，root 不并发写 B；等待真实恢复、新写、重启、第二备份恢复证据。
- 最终发布 Ops `d16dc78cae8ef67f24c0530f2705e2f81f27236c`，固定包 `/private/tmp/timeline-native-release-bundle-d16dc78`，manifest SHA `dda79f493a4c9f9a29025da02a3c04c7c9e0130120239c332ad3a79bc950f318`。119 项实际回归通过；最终身份/17源码 SHA/7脚本及10 payload 独立静态复核通过。旧 13131ee 运维包禁止执行。先持久保存/私有推送及只读预检，C 通过后再受控备份/中断恢复演练/程序更新。
- 生产仍为 6c70，尚未执行本次更新，main/tag 未变。真实浏览器已打开正式原生登录页准备复验。最终 exact-domain 浏览器、独立恢复和完整产品接受仍待完成；不可将 253 HTTP 请求或软件包核对冒充这些结论。

当前：`CODE_IMPLEMENTED / FINAL_BUILD_AND_A3_HTTP_PASS / INDEPENDENT_RESTORE_IN_PROGRESS / PRODUCTION_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging URL 为上述两个明确本机 HTTPS 地址，不代表远端 staging 或产品接受。
