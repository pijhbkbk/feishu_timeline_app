# 2026-10-19 设计续接实施与验证

本记录对应所有者授权的现有工程实施任务。最终状态从 `docs/EXECUTION_LEDGER.md` 进入；安全状态仅以 `docs/security/FINDINGS.yaml` 为准。原始日志、真实工作簿与截图保存在本机，不进入公开源码或 CI。

## 可操作入口与版本

- 应用预览：<http://127.0.0.1:3390/dashboard>，原生账号、隔离 PostgreSQL、Redis 与真实扫描器。
- 参考 / 调整前 / 实装对照：<http://127.0.0.1:3394/>，包含 14 页路由映射、可放大截图和实际应用入口；本页不保存业务。
- 同机恢复副本：<http://127.0.0.1:3400/>，独立数据库与对象目录，运行 `aee63f6e51b477b9a43b5b5b3678ec0efd2703d7`。
- 本轮分支：`codex/design-convergence-20261019`。main 现场仍为 `9bdec2864c3ed9eb1a045062b756611f98208bfb`，CI `38866594479` 为 failure；本地结果不改变该结论。没有推送、main 合并、tag 或生产部署。

3390 当前运行 `4bdbb85174208d30a12c70bba777f1bd6a86c123`，tree `60781402dfee27c99d1f567019450ded7c858be8`；Web BUILD_ID `bcCQGc6V-oSOX4p4Df5TG`，构建时间 `2026-10-19T08:07:32Z`，API `/api/health` 与 Web `/build-info` 均返回200且四项身份匹配。制品来自干净提交的独立归档，不含根工作树原有脏台账。升级先保留原隔离库备份，核对固定提交的52项迁移输入后执行待应用迁移；对象目录未变。证据 `var/design-convergence-20261019/preview-4bdb-cutover.json`。升级前配置残留318 EXPECTED值、Web build-info500和首次前置断言拒绝均保留；c89 API身份正常，旧Web通过进程birth/PGID/监听端口/cwd和不可变制品验证归属，未把旧500当作PASS。

最终离线恢复实例：<https://localhost:45454/>，源/树同4bdb，镜像构建时间 `2026-10-19T08:05:17Z`。软件、合成加密备份及操作说明已保存在 `var/design-convergence-20261019/delivery/`；私密材料单独以0700/0600保存。它是同一Mac上的第二套独立新卷实例，尚未证明物理第二台电脑恢复。详细恢复与浏览器结果见末尾4bdb节。最新只读GitHub查询 `2026-10-19T13:26:32Z` 仍为上述main/CI failure，无推送或重跑。

## 提交与环境区分

| 提交 | 实际内容 |
|---|---|
| `31864786da03bb9e61f977a62edfd2c587c89631` | 自由工作簿完整存储、直接人员维护、M1 收敛与初始 CI 修复 |
| `aee63f6e51b477b9a43b5b5b3678ec0efd2703d7` | 背景图片、子菜单与保存脏状态 |
| `86f0300d9ccee6f8019b7580f71766dc7272a688` | 周活动与所有者确认的年度规则、图片 ID 兼容 |
| `f72b743fc702d7ec7cdba59ed228f0c5879f3b6e` | 有界、完整性校验的构建下载缓存 |
| `9710cbfbda9975c1c58f15cff8ff0167540eef6f` | 旧档案缺失普通状态与颜色切换陈旧内容清除 |
| `28689b652fe615d606fadd81f0e3bcbd4611c3ae` | portable 三基础镜像系统依赖修补 |
| `c89c5e5540c39423bd186539bb1ab3649771e9b6` | 工作簿地址/读取竞态、项目跟踪入口、产量来源兼容及 Sharp 实际运行 |
| `ede2439b7a353d1eaf98a0ca49e740e34e2a457a` | portable 状态输出白名单与合成泄密回归 |
| `de2b49c49358ffa917a237442672528a16da3f85` | 两 CHECK 前向规范化迁移与真实 PG dump/restore 回归 |
| `f92d85186df5bf09805933b0342248a650eb53f0` | proxy 精确 TLS 健康检查、8 活动与 8 等待连接上限、退出回收及专用 512MiB 容器预算 |
| `4bdbb85174208d30a12c70bba777f1bd6a86c123` | PDF inline 精确补 COEP，保留鉴权、CLEAN、CSP、CORP和nosniff |

本轮没有治理规则变更；末尾证据提交仅记录上述产物，不把文档 HEAD 当运行版本。代码状态为 CODE_IMPLEMENTED；已明确的本地路径为 LOCAL_VERIFIED；staging/production 与 MAIN_MERGED 均未因本轮改变。所有者产品确认仍待取得。

## 实现与合同

自由工作簿复用 Univer 1.0.4，保存完整 snapshot、版本和图片引用。多表、行列、格式、合并、公式、图片和背景图使用独立工作簿合同；原业务表格的稳定 ID、白名单命令、服务端授权、并发及扫描保护继续有效。颜色清单默认自由工作簿，`?view=records` 进入受控业务区。任意工作簿到结构化颜色记录的自动映射发布尚未实现；现有受控模板须带记录 ID 和版本，不能按行号或同名猜测关系。

人员库默认紧凑列表，可直接新增联系人、编辑、停用、归档、恢复。联系人不自动得到登录账号；归档和恢复不改历史作者、不自动启用账号。权限入口与普通名单维护分开。

周视图使用上海日期的周一至周日，活动及服务器统计采用相同基地 / 日期范围；活动沿用原 ID、版本与幂等更新。它不新增审批状态，也不自动完成项目月度流程。首次年度复核按所有者最终确认：入清单月至次年同月首尾计入 13 个自然月，次月复核；恰好 20 台继续保留。缺月或未知量不能当零，不自动退出。2026-09..2027-09、2027-10 的合同已实现；实际保存用已到期的合成 2024-09..2025-09 数据验证，未更改系统时钟。

## 一条实际走通的使用路径

9710 在 3390 使用合成项目 `cmvekxxcj00039koxr4d56ffj`：

1. 退出后受保护页面要求登录；使用本系统账号重新登录进入流程首页。
2. 点击“样板颜色确认”进入真实任务 `cmvenaqq6001c9kzqd6240ymz`。
3. 填写 2026-10-19、确认方“合成9710路径验证人员”和意见，上传 `synthetic-approved-report.pdf`。
4. 页面先显示传输 / 扫描，再显示材料已放行；点击“保存并返回”。
5. 返回带原 project / taskId 的首页，显示后续取号与涂料采购节点；重新进入并刷新，确认日期、人员、通过结论、意见、材料版本均保留。

证据：`var/design-convergence-20261019/after/confirmation-9710-path.json`、`confirmation-9710-refreshed-ax.txt`、`confirmation-9710-{scanned-css1280,returned-css1440,refreshed-css1440}.png`。这证明指定本地路径，不代表整个 18 节点流程或正式网站验收。

## 分项结果

| 项目 | 实际证据与边界 |
|---|---|
| 视觉 | 已先拍现场，再对照 14 页 PDF；保留 M1 暖白灰绿与真实流程图。重点首页、人员、工作簿有并排对照。已记录 1440、1280、1024；旧目标 390 的截图实际为 389 CSS px，保留原记录。c89 后续以 mobile emulation 取得精确 390×844 的首页、工作簿、人员列表及长姓名详情，实际 documentWidth 均 390。详见 `after/exact390-c89-evidence.json`。并非全部 14 页像素级验收；人员详情在正常视口打开后缩至390，仿真中的点击无响应不记作移动点击通过。 |
| 人员 | 实际新增无账号联系人 → 编辑长姓名并刷新 → 停用 → 归档后默认隐藏 → 恢复仍无账号。历史作者不变另有独立真实 PostgreSQL 验证；未冒称 UI 历史检查。 |
| 合成工作簿 | 实际两表、字体 / 对齐 / 合并、插删行列、撤销重做、行高列宽、公式结果 20、扫描图片、明确保存和重开；aee 版本 5 后所有者编辑形成版本 6，9710 只读重开保留。 |
| 真实清单副本 | 原文件只在本机复制，原 SHA 与导入前副本一致。86f 修复后 11 张表导入、保存 v2、重开；11 张背景图引用共享一份原图，浏览器与 Excel 均可见，导出背景二进制 hash 相符。真实内容不在对照包或公开制品中。 |
| 系统 IME | 所有者反馈“已测试，选词、保存和刷新正常”，记录 `OWNER_REPORTED_PASS`。不是自动化操作系统候选词事件证明；不把粘贴中文算 IME。 |
| Office | 实际 Microsoft Excel for Mac 打开合成导出件：2 表、1 图片对象、结果 20；真实清单导出件 11 表，无 repair 提示。未宣称全部公式、打印、DPI 或往返无损。条件格式、验证、筛选、保护等转换范围在导入时明确提示。 |
| 周活动 | 86f 新建 10/19 活动 → 编辑到 10/20，保留备注与参与人 → 同 ID 刷新；切上一周为空、回本周 1 活动。首次工具 fill 未触发 React 日期更新的失败保留，实际键盘输入后成功。 |
| 年度复核 | 合成 13 月逐月完整、总量 20，保存继续保留说明并刷新历史。9710 修复旧开发档案 404 的普通状态显示；年度历史仍在。19 / 21 / 缺月 / 并发等为真实 PG / HTTP 证据，不冒称浏览器负向。 |
| 同机恢复 | aee 新库 `design_convergence_restore_20261019_r1` 与独立对象目录实际启动；原密码登录、读取旧项目、保存新样板确认并刷新；原 PDF 下载 hash 与源一致。不是物理第二台电脑或最终 portable 验收。 |

## CI、安全与构建事实

源码、镜像构建、扫描、运行分开记录。已修复固定 Alpine 包不可取得、扫描工具与规则适配、精确 braces 本地修补，以及 Univer 子菜单、背景图片 ID 验证等问题。原始 npm 全依赖审计仍报 1 High；精确本地补丁校验后 residual 为 0，生产依赖为 0。不得把补丁后的判断改写为上游原始审计无命中。

9710 三应用镜像扫描无命中，但原 PostgreSQL / Redis / scanner 分别 89 / 47 / 3 个包级命中，原报告保留。包级命中不直接证明所有路径可利用。`28689b652fe615d606fadd81f0e3bcbd4611c3ae` 仅新增 portable 专用三份 Dockerfile：固定 OS 修补版本、PostgreSQL 直接以原 UID 运行、scanner 保留五个核心二进制 hash。独立 diff 审查后全六镜像实际 Trivy 为 0 命中、exit 0。286 候选六镜像扫描证据为 `/private/tmp/design-convergence-final-trivy-28689b652fe6/verification.json`，SHA256 `9001f776d247ac793f4005bf48ad4bd7a2a68d45c9dd2554ffbb5c7d6c85516a`。

实际启动 28689 新实例时 API 因 sharp 平台可选依赖被构建阶段 `--no-optional` 排除而退出。c89 保留锁定可选依赖，并在最终 USER node / network none 层实际转换 PNG、JPEG 为 WebP；三应用镜像真实构建成功。c89 三新应用实扫 0，三基础镜像按相同 ImageID 和完整证据复用 286 结果；不是六次新扫描。

c89 新实例实际通过严格 CA HTTPS 认证、原件/缩略图下载、工作簿保存及并发负向、人员维护、退出失效，以及扫描器 CLEAN / EICAR / 20MiB / 超限后恢复。加密备份成功，但新 B 恢复在两条 CHECK 的重导出文本差异处被严格拒绝；对象恢复、会话复位和启动均未因此冒称通过。失败 A/B 与备份保留。最终 de2 候选以事务内前向迁移固定两条等价表达，不新增 hash 豁免；作者与独立 PostgreSQL 14.24 分别验证原新 46 个边界、坏行导致整事务回滚、52 SQL 迁移的 schema dump/restore 字节一致。完整 Prisma 元表和应用恢复另验。

`ede2439b7a353d1eaf98a0ca49e740e34e2a457a` 修复 portable status 原样输出 Docker Command 的风险，只允许五个公共状态字段，限制大小/数量并清理异常输出。旧命令未在真实实例执行；合成前后重放证明原版输出合成 requirepass、修复版不输出，作者与独立 9 项回归通过。未声称发生真实凭据泄露。

de2 阶段源码证据为 `/private/tmp/design-convergence-ci-de2b49c-source-verification.json`（SHA256 `a748c9cdb1dc601efba669eff476df190fb56ca0372731f5a1bb8d271cec238c`）；新增 JS 实际 SAST 零命中，其余目标按相同 blob 复用；当前 1995 个 Git 文件与 430 个历史提交 secrets 扫描零命中。55 个 SCA 输入未变，精确记录复用原始审计和本地补丁事实。Prisma validate 实跑 exit 0。

## 当前候选检查与证据适用性

- G1/G2：自由工作簿、年度、周活动、人员/会话与图片采用各自目标回归和隔离真实 PostgreSQL；未配置数据库的历史跳过不计入。c89 导航/来源最终 root 35 项通过，独立导航 39 项通过且包含首次失败的两条；类型、局部 lint 通过。
- G3：86f 完整 Web 652 项、全仓 lint、类型/构建在修复夹具后通过；后续按实际改变的导航、API Docker、CLI 与迁移输入增量复验。de2 阶段 Prisma validate exit 0；不把旧整个 API 套件当本轮新执行。
- G4_DIFF：权限/保存/图片、年度/周活动、导航第二版、基础镜像、Sharp、状态输出与 canonical migration 均由独立只读上下文审查。最后两个修复分别绑定 `bec760d3a040e1cf585143331583caada4b59060da2212e8a3bc0d5e60a6d001` 与 `c11bcc6a3fb58032eeac31d73e84cd8a529aa44fac79a005e2a71beede3b74a7`。
- G5：仅限精确本机隔离 URL；正式 HTTPS、staging、main 合并、tag、生产访问/部署未执行。
- 正式页面占位扫描 0；12 条均为测试 API 名或负向断言，见 `var/design-convergence-20261019/placeholder-c89-final.txt`。

## 保留失败与未完成项

- 原始 CI / 扫描失败、Next 下载超时、真实清单背景不支持及 CUID 误校验、日期工具输入失效、首页请求超时均保留原证据，不覆盖为最终 PASS。
- 9710 产量页的非 Excel 来源 JSON 导致 `rowNumbers.join` 失败，原证据保留。c89 显示兼容修复仅标记“来源信息待核对”，不改源事实。实际加载 13 条 / 20 台，再新建独立松柏绿 2026-10 / 8 台，保存并整页刷新读回；总 14 条 / 28 台，年度原 13 条不变。月份工具 fill 失效被浏览器验证拒绝，原生键盘完成后才保存。
- c89 修复深链选错本、新建/导入 URL、初载重试与同组件 query 竞态；首次修复的两个失败回归保留。真实无效 ID 显示不存在、不回退首本。新建 `22205d21-fe60-4b7f-8a94-e45ef35ee9fb` 保存 v2，再恢复 v1→新 v3、恢复原 v2→新 v4；刷新见 B2=21。合成两表一图 XLSX 导入新 ID `fdd44911-adce-4fc5-bb4c-34e435485908`，图片扫描、明确保存、刷新同 URL v2，字体/合并/公式20/第二表图片保留。证据 `after/c89-browser-verification.json`，ready 截图与首次 loading 图分别保存。
- c89 另实际输入未保存 D3，状态显示待保存，点工作台出现离开确认；工具返回“操作被 confirm 中断”，随后对话框已不可取得且页面已导航，未能执行取消。因此取消离开仍为 `NOT_VERIFIED_TOOL_DIALOG_UNAVAILABLE`，不将组件测试算浏览器通过。浏览器 back 已实际回原工作簿 URL 并读取版本 4；本次未保存到服务端。证据 `after/workbook-c89-dirty-cancel-tool-limit.json` 与 `workbook-c89-back-version4.{png,txt}`。
- 项目评审、标准板在当前项目未到对应节点时保持后端门禁；打开和禁用观察不算创建、提交、下发完成。完整 14 页全部主动作、任意工作簿映射发布、完整 Office 兼容、物理异机恢复与正式 HTTPS 产品验收未完成。
- 原有 185 个跳过不是本轮 PASS；只按当前变更和证据输入复用无关验证。唯一 Finding Ledger 的 24 个既有 schema 错误保持原状；新增条目单独校验，不以此声称全账本 schema PASS。
- c89 项目总览四个跟踪入口真实点击、back 回 tracking，最后返回来源到项目列表；旧月评/量产页面自身返回链接为 flow，门禁观察不算写入完成。
- 两次当前 dashboard CDP 截图失败保留，停止同因重复；恢复正常视口后的原生窗口截图成功。c89 已取得工作簿、产量及项目跟踪 ready 图；旧 9710 1440/1280 与 86f 实际 389 图继续保留原版本标签。
- 本轮没有生产扫描 VM 启动或正式网站改变；10/18 所有者保盘停机记录保留。最终产品状态仍为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。

原有未提交台账与用户媒体完整保留；所有工程提交显式暂存，没有 reset、强推或批量清理。治理规则未修改。

## de2 镜像与恢复证据

三应用镜像来自同一不可变 de2 commit/tree、构建时间 `2026-10-19T06:31:50Z`；API / ops / Web 实际构建均 exit 0，编译身份、依赖及 52 migration 逐项读回。`/private/tmp/design-convergence-final-trivy-de2b49c49358/verification.json`（SHA256 `7ba5ac668cf46bc3170fb4b10a2234d286684ebe41501a82d917af006c424c1e`）记录三新应用全严重度零命中，三基础镜像按精确 286 ImageID / labels / Dockerfile / 28 个既有证据摘要复用零命中。

de2 A/B 为同机不同隔离实例和新卷，分别使用 `https://localhost:45443` 与 `https://localhost:45444`。严格 CA API 实际验证原生认证、扫描图片与缩略图、完整两表 snapshot、版本冲突、人员维护与退出失效；扫描器实际验证 CLEAN、EICAR、20MiB、超限后恢复与不可达 fail closed。加密备份 SHA256 `40d8eabb0f77919102bd7589e254be15b38ecef3044883b895fe6b1b51525148`；新 B 恢复于 `2026-10-19T06:50:12Z` 成功，70 表、1 原始对象、序列与全 schema 一致。完整 schema 为 185683 字节，源与恢复 SHA256 均为 `dc325684079569492c944b1ff1b1c47dc24b0b6f82002359f4d94f8bbb4a3919`。旧会话未导出/恢复，旧 cookie 返回 401；原密码登录、工作簿与图片读回、新写至 revision 5、退出和重启后再读回均有 API 实证。`runtime-status.json` SHA256 `3a10604cd3461da2c3a298b858f25d1a0f4aec324598034be225664d5b670330` 是 `06:54:20Z` 的历史结果，不是后续运行可用性保证。

随后实际 Chrome 验证发现两个独立问题：proxy 继承 API 的 3001 端口健康探针而误报；浏览器多连接触发每连接一个 Node 转发进程，共用 proxy 的 128MiB 限额，proxy 于 `06:57:22Z` OOMKilled / exit 137，页面停留加载并在刷新时 `ERR_CONNECTION_CLOSED`。此时 API / Web / PG healthy，Redis / scanner running（未配置 Docker health），proxy 已退出。所有者已手动处理证书提示并进入登录页，但该反馈不能代替后续浏览器业务保存。原 B 未重启掩盖失败；浏览器保存与刷新尚未通过，修复在独立候选进行。诊断 `/private/tmp/design-convergence-portable-de2b49c49358-evidence/gui-readonly-diagnostics-070237.json` 与 `after/portable-de2-chrome-connection-closed.{png,txt}` 保留。一次 stop/start 并发导致 operation.lock 拒绝也原样保留，等待正常释放后独立 start 成功，不删除锁或改写原结果。

de2 软件包及合成加密备份已按摘要复制到 `var/design-convergence-20261019/delivery/`，密钥与合成账号仅保存在分离的本机 0700/0600 私有目录，不进入软件包、源码或报告。该候选因上述代理运行问题尚不能作为最终可用交付。

## f92 代理修复与新增真实路径

`f92d85186df5bf09805933b0342248a650eb53f0`、tree `b3dec3c776be87829744d15fda2b7559d5238e61` 仅改四个 portable 文件。健康探针使用本实例精确 CA、localhost 主机名、对外 Host 和预期 API 构建身份，3.5 秒总时限及响应大小边界；没有跳过 TLS。保留 Node 字节转发，活动连接最多 8，另最多 8 个暂停读取的连接等待 2 秒，槽位到 exec 实际关闭后释放；只把该 proxy 容器预算设为 512MiB，未改全机资源。作者与独立各 19 项回归通过；实际容器 6 连接连续刷新、320 次快速连接、8 秒完整响应、8 活动连接跨自动健康检查、等待超时/第 17 拒绝、慢握手和回收验证通过，峰值 372838400 字节、oom_kill=0、最终仅主进程 1。旧 128MiB OOM、nc 试验与工具失败按原结果保留，nc 未交付。独审 SHA256 `fe0b8e10c3042e1082f34122466b4cd46a9330d62f2e89d0f9eb903f0c616fa8`；技术收据 `/private/tmp/design-convergence-proxy-health-verification.json`。合成测试结束时 5 秒强停造成的 exit137 且 OOM=false 不算正常应用优雅停止证据。

f92 源码安全证据 `/private/tmp/design-convergence-ci-f92d851-source-verification.json`，SHA256 `fc21aa83db6a4e0f0f628a5d72aea391cf721b309ecfeadb2740377159cc4b44`：实际 4 目标 / 73 规则零命中与工具错误，旧 1061 目标按字节未变复用；current 1996 Git 文件与 history 工具实际扫描 431 commits 均零命中。可达提交总数 445 不替代工具扫描计数。SCA 55 输入及原审计摘要未变，原 High1 / FAIL 与精确本地修补分列。

c89 另在真实 UI 新建 `合成创建验证灰绿c89`，项目 `cmvey2ws3001a9kuqemje6d81`：选择合成基地甲、填写合成批准日期 2026-10-19/依据/来源、上传合成 PDF → 自动扫描放行并登记批准报告 → 进入项目 3/18 → 编辑说明 → 整页刷新重新打开编辑框读回 → 无修改取消。报告节点 `cmvey2xyf00259kuquf6jrzyt` 显示相同日期/依据/来源、已放行 V1 和审计；返回原项目 `tab=flow&taskId=…`。资料页实际下载与原 PDF SHA256 均为 `97f59943dabd4bcc3b8f88207a625bfbbc0598b889f910c45466ba8127aecfdd`。相关证据 `after/project-c89-{created,edit-readback,approved-report-readback}.{png,txt}`。

该新路径发现 PDF 内嵌预览失败：真实响应 200、application/pdf、inline，保留 sandbox/default-src none、CORP same-origin、nosniff；缺少父页隔离合同要求的 COEP。浏览器明确 `coep-frame-resource-needs-coep-header` / `ERR_BLOCKED_BY_RESPONSE`，因此不能用下载成功代替预览通过。现场、白名单响应头与网络错误分别保存在 `after/project-c89-material-preview-failure.{png,txt}`、`project-c89-pdf-response-headers.json`、`project-c89-pdf-network-diagnostics.json`。该失败随后由4bdb修复PDF inline响应头，保留其他安全限制；f92阶段只完成镜像构建，最终新A/B与人工显示验证另列下节，不改写本次c89失败。


## 4bdb 最终制品、恢复与浏览器结果

最终软件包 `var/design-convergence-20261019/delivery/design-convergence-portable-4bdbb8517420-software/` 含8文件，manifest SHA256 `6c0d788181223e9137524ff266654572b1c3db974c57a7c23b29dad06932f530`。API/Web/ops新镜像实际构建成功、全严重度Trivy零命中，三基础镜像按精确ImageID复用286已审证据；不是六次新扫描。源码SAST新增2个实际目标/79规则零命中，其余1063目标按相同blob复用；current1996 Git文件、工具实际history432提交secrets零命中。55个SCA输入及原始High1/FAIL、精确braces补丁residual0/生产0仍分别记录。最终源码收据 `/private/tmp/design-convergence-ci-4bdbb85-source-verification.json` SHA256 `60f0ca9a701f70d9bd2fd13d4e0b3ab82cfd9d062b1c1577dd71c2b0d1d4636d`；最终镜像收据 `/private/tmp/design-convergence-final-trivy-4bdbb8517420/verification.json` SHA256 `0212a4f6cdd5319d0d8c765a02e33f786f86b4f8ea2efd35cbcb522773305126`。独立只读核验139个不同公开文件摘要、55输入和6镜像身份，无新增阻断；不据此宣布全仓无漏洞。

严格CA验证的新A `https://localhost:45453` → 加密备份 → 全新B `https://localhost:45454`：70张表、2个原始对象、序列与完整schema相同（185683字节，SHA256 `dc325684079569492c944b1ff1b1c47dc24b0b6f82002359f4d94f8bbb4a3919`）；旧会话未恢复、原密码可登录、图片原件/缩略图和工作簿可读、新写入/退出失效/停止重启后读回均已实测。合成备份SHA256 `c4b7994eb942299181e943399a0ded4a446b46d459b8d8fa9183f216a851891e`，未包含生产数据。A已正常停止、B保持运行。API/Web/PG/proxy为healthy；Redis/scanner为running但未配置Docker health，不称六服务全healthy。代理512MiB配置保留，实际观察无OOM；旧de2 OOM失败不被覆盖。

实际Chrome使用原账号登录B，进入颜色工作簿，新建 `合成恢复浏览器验证4bdb`，ID `72b9c48b-63a2-4a49-993f-18eee00204bc` → 输入A1/B1/A2/B2（恢复后浏览器写入、数量、合成松柏绿、20）→ 保存版本2 → 整页刷新同URL，版本2与四格读回。证据 `after/portable-4bdb-browser-verification.json`、`portable-4bdb-workbook-readback.{png,txt}`；这是普通浏览器粘贴，不冒称系统IME。恢复前工作簿和原接口验证版本未被该新建操作覆盖。

PDF修复只在application/pdf且inline时增加COEP credentialless。作者与独立各86项目标回归，权限/扫描状态/CSP sandbox/default-src none/CORP same-origin/nosniff均保留。新B PDF接口实际200/原件hash一致、匿名和退出后401；自动Chrome的预览区为空白，CDP明确提示Browser Use正在暂停文档响应，记 `AUTOMATION_INCONCLUSIVE_PAUSED_DOCUMENT_RESPONSE`。所有者对精确新B资料URL手动反馈“能看到 PDF 正文”，记 `OWNER_REPORTED_PASS`，与自动证据分开；不假称自动绘制通过。原4bdb PDF独审 SHA256 `5f44b23e4d54bb6a5d4d4ffd5b9287d53cb661c6601ee60bc2835fa83d74e946`。

另发现既有登录返回白名单遗漏 `/projects/:id/materials`：该深链登录后落/dashboard，手动进入资料可用；`?tab=materials`项目首页形式在白名单内。实际函数复现与6个相关源/测试对main逐字比较，证明不是本轮回归。此缺陷仍未修复，不能把资料深链登录返回记PASS；诊断 `/private/tmp/design-convergence-login-returnto-readonly-diagnosis.json`。本轮产品整体仍为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`；14页未覆盖主动作、物理异机、完整Office/任意业务映射和正式域名仍按上节未完成。


3390升级后另已真实重新登录，回到原项目及 `tab=materials&taskId=…` 查询；原项目、CLEAN附件和原始下载SHA均保留。PDF网络200且COEP头已出现，原coep-frame缺头阻断未再出现；内置浏览器仍只显示黑色阅读区，并记录blockedByClient及既有inline-style CSP错误，不将其记为自动PDF绘制PASS。精确45454的人工显示反馈不外推为3390 IAB兼容性。证据 `after/preview-4bdb-browser-verification.json`、`project-4bdb-pdf-network.json`。

3390同次升级读回旧合成工作簿 `22205d21-fe60-4b7f-8a94-e45ef35ee9fb`：仍为版本4、A1合成导航验证/A2保存与重开/B2=21，本次未写入。截图与AX `after/workbook-4bdb-upgrade-readback.{png,txt}`；不将一次抽样宣称所有数据逐格核验。

最终对照包45张授权参考/合成图片、48项公开资源、14行映射；私密路径404、错误Host421，同页CTA进入3390。精确390布局、c89项目新建/编辑/报告、4bdb恢复工作簿新增图保留各自版本，旧图不改记最终运行。源包 `/private/tmp/design-convergence-compare-20261019`，最终核验 `/private/tmp/design-convergence-compare-verification-final-4bdb.json`。

对照最后仅补文本边界：`/private/tmp/design-convergence-compare-final-text-addendum.json`（SHA256 `80f5bdc906a23a30c225f5c4976b748a9db1ad40a1f9c8fcd0f89cfed4589c75`）绑定最终HTML/manifest，复用同一图库/脚本/服务的48项检查。49个对照包文件已原字节持久复制至 `var/design-convergence-20261019/delivery/reference-comparison-20261019/`；根任务已重新加载实际查看最终三列与边界并保存 `after/comparison-final-4bdb.jpg`。

末尾四文档提交的适用性单独核对：54个非Ledger SCA输入逐字未变；Finding Ledger原55项、唯一braces节点和顶层语义未变，新增4项为已审状态。不能把增加新Finding后的整个Ledger文件说成字节未变。冻结index恰4份文档，原10行Oct18仍是唯一已跟踪未暂存差异，独审 `/private/tmp/design-convergence-final-four-docs-frozen-index-review.json`。应用/镜像运行身份继续为4bdb，文档提交不重标旧测试或运行。
