# 独立静态复核（2026-09-17）

审查者：`fresh_catalog` 独立上下文。只读检查其他作者代码与已保存记录；本提交仅增加证据文档。当前结论为 `STATIC_DIFF_REVIEW_COMPLETE`，不是候选动态测试、部署或产品验收通过声明。

## 精确范围

- 集成 runtime：`13131ee5425017b31ccf77741798a8dc37dbc936`；tree：`14001bed5b79c89f2bed9289932adbf876f8d03d`。
- 工作台补丁：`d6004cd6c04bbefebd9cf5564ceeb267e447685b`。
- A2 脚本及记录：`51fbc77566f7ce7e4540cebd94608a546b013c74`，包括本目录 README、各结果 JSON、合成快照、`scripts/testing/native-business-acceptance.mjs` 与 `native-business-setup.py`。
- Portable 作者最终补丁：`174d8ffc8a0ca70df429fe7f1be18a7b8b4d75a0`。其 `scripts/portable/portable.mjs` 与集成 runtime 对应 blob 均为 `e813e8fabb28a854cb7e1013eb311d520b6a27ee`。
- 本次没有执行应用测试、攻击演示、权限提升尝试、数据库实验或生产访问，没有修改被审源码。

## 工作台

未发现本补丁范围内的静态阻断。无当前待办时只描述当前账号没有待处理工序，不再推断全系统没有项目；缺少部门改为“尚未分配部门”。新建项目按钮仍由既有权限决定。

后端仅将相同 `visibleProjectWhere` 的项目 ID 全量读取再计数改为数据库 `count`。`buildVisibleProjectWhere` 未改：管理员既有全局范围及普通用户的负责人、成员、任务指派范围均保持。审计读取范围没有扩大。

新增 Web 用例覆盖有项目无待办、空安装、普通查看者、错误、加载和替换账号上下文；它们使用模拟上下文与服务器静态渲染，不能证明真实浏览器登录切换、尺寸布局或目标域名已更新。API 回归断言相同过滤条件且不再调用项目 `findMany`。本次只核对测试代码，没有重跑或将旧 A2 API 当作工作台候选测试。

## A2 证据边界

文档与结果明确把实际 HTTP 运行版本标为 `6c70a897ec7643f4681616d801481765aaa8f7bc`、本机 `http://127.0.0.1:3351`、数据库 `native_auth_test_http`；fresh catalog 为 `1d8ff6d41e71fb202ef433c58c458c355a3dca2e`。状态为 `LOCAL_VERIFIED_PREPARATORY_RUNTIME`，没有把这些结果冒充 `13131ee` 镜像、浏览器、生产、断网或异机恢复结果。

实际记录包括原生账号、正式角色授予、会话撤销、项目/任务/附件范围、真实扫描、流程退回重提、通知和审计。报告说明服务级 PG 测试的协作者 mock 不能替代真实 HTTP。A2 加入标准 bridge 的事实也明确排除离线结论。

中间失败原样保留：退役接口的 400、错误审计路由的 404、错误的 REJECT 重提假设、附件内部字段不在响应等均有说明。`.txt` 文件类型拒绝和早期扫描停机弱断言被明确废弃，不能因历史 JSON 的顶层 PASS 再次计入。后续 DOCX/扫描停机严格断言与保存的检查点区分；`REUSED_SAME_SYNTHETIC_RUN` 只表示复用同次动作，不算新执行。最终附件报告的 DOCX 检查为复用检查点，本次没有重新观察扫描运行。

目标守卫固定合成环境或批准的本机 A/B URL，核对容器标签、镜像、运行 commit、数据库、mock/扫描配置；合成密码状态要求受保护文件并与提交证据分离。恢复分支没有注册、seed 或初始化账号。

一项需在最终 A/B 验收前补齐的准确性边界已告知主任务和脚本作者：README 对尚未执行的 B 分支写“ID与角色”，但 `restore` 当前仅显式断言账号 ID、本地认证、代表性业务快照及部分范围拒绝，未比较完整 `roleCodes` / `permissionCodes`，代表性快照也不含角色关系。应增加相应断言或缩小文案；本目录尚无 B PASS 声明，此项不改变已保存 A2 结果的限定状态。

后续静态复核：作者提交 `820fc12b2d0e952476e1dedcb612fba918cce019` 已补齐该断言。源 readback 保存四个真实登录账号的规范授权快照；B 从 `/auth/me` 逐个比较 ID、登录名、管理员标记、部门、岗位意向以及排序后的完整角色/权限集合，缺少源快照即拒绝。本项在代码层已修正，新增 B 分支尚待实际执行，旧 A2 PASS 不作其动态证明。

## Portable 最终只读复核

此前指出的 PostgreSQL 管理查询上下文问题，在最终补丁的静态路径中已覆盖：全部 16 处管理员 SQL 调用经固定 `adminDatabaseCommand`；连接前固定 `PGOPTIONS` 的 `search_path=pg_catalog`，数据库参数限于 `postgres` / `timeline`。目录、会话、预备事务与订阅检查在控制数据库 `postgres`，目录关系和相关函数显式限定 `pg_catalog`；订阅检查限定目标数据库。仅新空库建立时以管理员向 `timeline` 执行固定 schema 授权。恢复内容、业务读取、指纹和边界重置通过实际应用/备份账号登录，未以管理员会话切换角色替代隔离。就此限定问题未见剩余静态阻断。

`data.mjs` 静态范围：对象只接受受限相对路径、普通文件和单硬链接，限制深度/数量/字节，读取核对属性和摘要；恢复要求空卷、先校验全部记录、独占写入并读回比对。Redis 仅包含 `notifications:jobs` 与 `notifications:queued:<64hex>`，要求空数据库，以绝对到期时间恢复剩余寿命并跳过到期项，不恢复会话。该结论依赖外围冻结/单写者过程，不代替非空队列、持久化卷或 A/B 恢复实测。

上一轮最终审查被自动内容安全检查拦截，主任务已记录。本次按收窄范围只做低风险静态阅读；被拦截 turn **不计 PASS**，没有再次执行相关实验。作者报告最终 PostgreSQL 1/1 与 TLS 通道 1/1 通过，属于作者动态结果，本次没有独立复跑。

后续包装器修复 `cd3fc48187ba8029cbacc48a6ca1424b90bfff97` 另作单行静态复核：初始化由修改 `process.argv` 后加载模块改为固定 Node/原 CLI 路径的 `execFileSync`，参数使用数组且无 shell；密码继续经 stdin 写入同 UID 的临时私有 0600 文件，不进入 argv，容器清理边界不变。未见该差异新增静态阻断；作者报告原失败环境初始化通过，本审查者未重跑。此修复触发主任务重新冻结候选，原 `13131ee` 及相关发布包不能自动冒充新候选。

## 验证来源分开记录

| 来源 | 已有结果与限制 |
| --- | --- |
| 本审查者更早的独立动态执行 | 较早 portable 版本的 manifest/加密组件 2/2、drain/notification 52/52 及隔离 PG 边界 1/1；`e16ccc9` 的独立 TLS 通道验证曾因握手前连接关闭失败。以上均不能冒充最终 `174d8ff` 动态 PASS。 |
| Portable 作者最终动态结果 | 作者报告 `174d8ff` 的 PG 与 TLS 各 1/1；本次仅查看最终代码，不将作者结果标为独立复验。 |
| A2 执行者保存结果 | 本目录 28 + 7 个测试、32 请求 HTTP 及业务结果属于记录中指定的准备环境；本审查者此次只核对记录/脚本一致性。 |
| Fresh catalog | 本审查者为 `1d8ff6d` 的实现作者，其 3 个单测和真实 PG 15 个用例是作者执行。该代码由 `portable_recovery` 独立只读复核，报告未见阻断并确认表锁、精确迁移基线、已有业务拒绝、无账号自授和常量复用；对方未重跑 15 个 PG 用例。不得把本审查者的自审算作独立审查。 |

本证据提交不改变 staging、production、main 或 tag；没有目标域名浏览器结果或产品负责人确认。最终候选构建、独立离线 A/B 恢复、生产更新和产品验收分别由主任务后续证据决定。

## 后续恢复门禁与源码树复核

`5934e25e20ae8669f04b2f56e9fd1756f08cea11` 的 pack 增加实际 `commit^{tree}` 与 manifest tree 比较；commit/tree 已由 40 位十六进制格式验证，命令为结构化参数，检查发生在创建软件输出目录之前。此项补上“实际源码树—manifest—镜像标签”的绑定，静态未见新增阻断；本审查者未重跑打包。

对作者提供的两份完整合成结构文件只做文件阅读、diff 与 SHA-256 计算，没有向 PostgreSQL 执行它们。源文件 143287 字节、恢复文件 143285 字节，均为 4572 行；唯一差异是 `trial_production_issues_text_bounds_check` 将第一组长度上下界 AND 的一层括号去除。六个字段长度比较、运算符、界值及其余结构字节不变；在这组长度比较中该 AND 重分组语义等价。完整源 SHA 为 `3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0`，恢复 SHA 为 `175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6`。

作者报告自动审批拒绝加入该精确 schema hash 例外，理由为接受不匹配会削弱完整性门禁，补丁未应用。本审查只记录差异事实，**不替代平台许可，不要求用其他写法绕过拒绝，不将本次恢复失败计为 PASS**。表/序列一致和失败目标保持禁止登录属于作者提供的运行结果，本审查者未独立执行数据库查询或恢复。

## 签名版本下限跨恢复

静态审查 `2eefc6b6e334481bb1d10a809b9ef32c6ce08821` 及修正 `2846bc6bfe7243539cfefa06929520c51b3a7997`（最终作者 tree `3bb4571f59c50a50ebb93086624b3e95e61d6213`）。限定范围未见剩余静态阻断：

- 独立 `signature-floor.json` 只含三个固定病毒库名称及非负安全整数；备份记录现有 floor 与验签 receipt 各版本最大值，恢复再与目标现有下限取最大，B 再备份也不会丢失原下限。
- 备份正文版本改为 2，明确拒绝 v1，不静默缺省旧材料。软件 manifest 及镜像/PG 版本精确绑定保持。
- 恢复与签名导入先停止 scanner，再将最大下限以临时文件、fsync、原子 rename 持久化。后续失败不降低版本下限；恢复不写伪造活跃 receipt 或签名时间，不将下限当作官方验签证明。
- 签名导入仍对冻结的完整三文件验真，并保持 daily 48 小时要求；启用时继续核对代际、完整摘要、挂载和下限。缺签名可保留原生账号/非附件业务能力，但扫描服务保持关闭。
- 复核发现初版 `existsSync` 会把悬空 metadata 链接误当缺失；2846 改为 `lstat` 且仅 ENOENT 视为缺失，再由原 `NOFOLLOW`、所有权和私有模式读取拒绝异常节点。测试代码包含真实临时文件、receipt/floor 取最大、两处悬空链接及不完整 receipt。

作者报告对应 4 个测试通过及 A2 官方签名导入落盘下限 `339 / 28125 / 63`；本审查者只读检查，未独立重跑。跨恢复/二次备份/断网的动态证明仍须另取，当前 schema 门禁失败不能计为这些行为通过。

## 独立恢复主机 B 防火墙顺序建议

只读审查 `/private/tmp/timeline-b-preserve-firewall-order-20260917.py` 及其引用的既有安装文件。脚本通过固定 LIMA_HOME/实例进入 `lima-timeline-recovery-b`，远端再次核对 hostname/root/原策略摘要；只为 IPv4/IPv6 的 `DOCKER-USER` 添加到既有本任务拒绝链的 hook，不删除现有规则，不修改 Mac。Docker 官方说明 `DOCKER-USER` 在 `DOCKER-FORWARD` / `DOCKER` 之前处理，与此处修正规则顺序的机制一致。[官方说明](https://docs.docker.com/engine/network/firewall-iptables/)

在主任务声明的空镜像、自有拒绝链已存在的隔离 B 前提下，未见本脚本静态阻断。保留旧文件使用独占创建与 fsync，并非临时 rename；中断会停止但可能需人工核查残留，不宣称任意中断自动续装。本审查者未执行脚本、冷重启或出口探测；链存在的静态文本不等于持久阻断的动态 PASS。

## 用户明确批准后的精确 schema 例外

用户随后明确批准 `schema-exception-proposal.md` 所述这一项有向完整双哈希例外。作者通过正常工具应用并提交 `68dd91b62030267f4ecbaab229c483ab96f582f7`，tree `3712801aa9f5a216a7fb41bfa3865e98c763c887`；本次未再收到拒绝，不将用户授权表述为覆盖平台限制。

独立静态复核确认：仅导出 `compareFingerprints` 供回归调用，并在既有 schema 相等/历史例外之外增加源 `3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0` → 目标 `175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6` 的组合。方向、完整 hash 及范围与获批材料一致。表和 sequence 的严格相等检查仍先执行；未知 schema、反向组合、manifest 身份、角色、事务、对象摘要、会话及签名门禁没有被放宽。回归代码覆盖该匹配、反向、改变源/目标、表内容摘要、额外表及 sequence 变化拒绝。限定静态范围未见新增阻断。

作者报告新增回归先失败再修复，最终 5/5；主任务报告集成 `f23b29b` 后独立实际重跑 5/5。本审查者没有执行这些测试、数据库恢复或此前被拦截的实验，以上执行来源明确分开。原失败恢复保留为 FAIL，不追认通过；之后全新目标的预演和最终候选恢复须另取实际证据。


## 最终冻结制品只读复核

本节检查实际文件字节与保存的非敏感镜像回读，结论为 `LOCAL_ARTIFACT_INTEGRITY_VERIFIED`。runtime 为 `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，tree 为 `830e562f5ec56e99d7fc0b04432fc056dd772254`，release 为 `native-portable-20260917-c5aed415cd17`，buildTime 为 `2026-09-17T08:04:51Z`。本节证据另行提交，不包含在该冻结 runtime 中。

实际读取 `/private/tmp/timeline-portable-delivery-c5aed415cd17/software`，确认目录只有 manifest 和其列出的七个文件，七项 SHA-256 全部一致。冻结 detached clone 和主任务 clone 均为上述 commit/tree、工作树干净。`source.tar` 与该 clean clone 的 `git archive` 输出字节 SHA 完全相同。精确摘要及方法边界见相邻 `final-artifact-review-c5aed41.json`。

`images.tar` 共 77 个归档条目，72 个内容 blob 全部重新计算 SHA-256 与名称一致；从顶层六个镜像递归检查 OCI index、manifest、config、layer 和 attestation 描述符，大小均匹配，引用的 72 个 blob 全部存在，无缺失。兼容 Docker 清单包含相同六个可执行 config/layer 集合，均为 Linux/amd64。API/Web/Ops 包内 config 的 commit、tree、release、buildTime 标签与软件清单和构建记录完全匹配；基础设施三个镜像身份也一致。此处没有解包执行、加载或启动镜像，也没有重新计算 layer 的解压后 diff_id，因此仅报告实际做过的压缩字节、引用闭合和身份检查。

补充 `corresponding-source` 六个文件的实际摘要全部匹配，其 ClamAV 官方源码及项目 patch 摘要与扫描镜像的标签一致。补充清单保留的 `sourceCommit=13131ee...` 是原有材料的历史来源标记，不能当作当前应用源码；当前应用源码由上文 c5aed41 的 source.tar 证明。原有验证文档保留其自身历史边界，本次没有重做 ClamAV 构建或历史 suite。

主任务随后提供实际 push 回读 `/private/tmp/timeline-pushed-images-c5aed415cd17.json`。本审查者核对 API/Web 的完整 registry repo@digest、tag 和本地制品对应 digest 一致，记录如下：

- API：`us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api@sha256:40544930b329416679f24ebc6dd2354e24beaec9d8490b9edbdbda5e0f71d192`。
- Web：`us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/web@sha256:774419239cea09f8d341fd29ed34361b47012c720bafbe7a3a5ef0d60ffa187b`。

上述 registry 操作由主任务执行；本审查者只比较其保存的实际回读，未用本地 ImageID 冒充独立 registry 查询，也未声称 Ops 已上传。离线 B 首次证书路径失败、后续安装/恢复、A3 业务路径以及最终目标域名发布均不在本次文件审查范围，须分别保存真实结果。本审查没有访问生产、改变 main/tag 或取得产品负责人确认；不将此文件完整性结论称为部署或产品验收完成。


## 外部合成恢复边界 fixture 只读复核

作者提供的外部辅助文件 `portable-boundary-fixture.mjs`，最终 SHA-256 为 `3ac850e8260fd4818348ff0b8e312d5ed39de07c2b6dcc744388d32919c192db`，不属于冻结 runtime。仅静态阅读，未执行。它要求显式合成确认、固定 purpose/实例名/容器标签、镜像与 runtime 身份、本地认证 mock 关闭、指定数据库及 48 小时签名配置；prepare/stage-queue 仅 `https://localhost:3450`，verify/queue-readback 仅 `https://localhost:9444`。临时账号采用合成前缀及随机值，队列操作固定该合成管理员和明确的合成 dedupe key。

恢复码检查先断言旧未使用 token 仍在原 expiresAt 内，再断言 401，并只读确认三个 reset 字段清空；之后为同一用户创建新恢复码并恢复登录。它不会把自然超过 30 分钟当作旧码撤销通过。另比较四个账号完整授权声明和停用账号拒绝登录；队列写入前核对源 API 已停止、退出 0 且未 OOM，经既有 enqueueOnce 写入非空队列并重复去重；目标检查一条通知、空队列、正去重 TTL 且绝对到期时间未延长。这些是断言设计，不是本审查者的动态 PASS。

初次审查发现私有文件检查没有同时约束其目录，保存也直接打开路径。作者在外部 fixture 中补充当前用户持有的私有非 symlink 目录检查；保存改为 O_NOFOLLOW，取得 fd 后验证普通文件、当前 UID、单链接和私有模式，验证后才截断、写入和 fsync。最终上述 SHA 的两处修正已复核；限定静态范围未见剩余阻断。作者报告实际 A 目录为 0700 及语法检查通过；本审查者未读取 secret 状态或执行 A/B 业务，真实恢复结果须另记。
