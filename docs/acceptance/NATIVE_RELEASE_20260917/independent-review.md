# 固定发布工具独立静态复核（2026-09-17）

审查者：`fresh_catalog`，不是本批发布工具作者。最终代码范围为 `9eb83f414597909e43bc351ac71791615c895b49`，tree `efcd0f9cb29009f8728ab064a1b19670f6e99fdd`；含 `d71fd666edab40cec7e4cbfbea3902a3b8ae49bf` 的发布控制器、保护备份、目标常量、生成器/四个模板，以及必要的 API 停机包装器与 systemd 单元差异。只读核对代码、测试代码及作者保存说明；没有执行发布脚本、实验或生产访问，没有改变被审源码。

结论：`STATIC_DIFF_REVIEW_COMPLETE`。下列已提出问题在最终代码中已修正，限定范围未见剩余静态阻断。此结论不是最终候选可发布许可；**主任务因 portable 初始化修复正在重新冻结 runtime，现有 13131ee 目标及所有旧生成包暂停执行**。新 runtime/镜像身份需重新固定并对照实际制品。

## 核对结论

- 固定从实际已提交的 6c70 state 升级，缺状态或初始 f2da 被拒；环境变化限定构建身份，旧数据库、对象、Redis 和认证安全配置保持。受控 runtime 路径有精确变化清单与逐文件 SHA，禁止 schema/migration/依赖/锁文件等未经批准变化；不再用“API 无变化”的旧假设放行。
- 独立发布锁与共享备份锁均为非阻塞；恢复遇仍在运行的发布操作退出，不抢改 pending。等待应用启动与健康检查位于共享锁外。安装期间调用的 `check-committed` 不再获取共享锁，所审路径未见嵌套等待死锁。
- pending 先持久化，再关闭入口、停止自有 API/Web、冻结指定 native role 和专用 Redis。备份只包含已提升的 native 数据库、自有对象根和专用 Redis 文件，落在既有 root 私有目录；不导出整机/旧共享应用。新启动前后比较数据库指纹与对象字节，变化不能通过恢复数据或删表排除掩盖。私有备份含账号哈希/业务/Redis 会话，不是软件包或可公开证据。
- 恢复选择 pending 中的上一程序并重新启动专用依赖，不回放初始化/migration，不恢复数据库或 Redis；已 committed 新版本不会被普通 recover 自动降回。显式回退仍先保护当前数据。最终产品状态继续与进程健康和本机 upstream 结果分离。
- 安装脚本使用固定内嵌 payload、预期旧 controller/unit 摘要及受控 root 目录；不从低权限 checkout 导入特权代码。源码 checkout 使用原非 root 用户、精确 ref/commit/tree，镜像只拉固定私有 RepoDigest。临时 registry 凭据有受保护目录和正常/可处理异常退出清理；本次没有调用拉取。

## 复核中修正的边界

1. 新 helper、journal 和保留原件原先直接写正式路径；写中中断会留下半文件，使再次安装在摘要检查时拒绝继续。作者已统一为同目录临时文件完整写入、fsync 后原子激活，旧正式文件原子替换。测试代码扩大为 19 个写入点的半写/完整写后中断及重入；本次只读检查这些用例，没有执行。
2. 初版仅增加 Docker/systemd 停机时间，外层 `network.run` 仍固定 45 秒。现精确自有 API 停机链为应用 drain 45 秒、Docker 65 秒、Docker 包装器 80 秒、API unit 90 秒、对应 systemctl 包装器 110 秒；其他命令包装器默认 45 秒，Web 20 秒不变。扩展预算在包装器按固定命令形状限定，调用方仍先校验自有容器。新 API 受控停机非 0、OOM 或退出证据缺失时拒绝一致备份；旧 6c70 只记录冻结/退出事实，不冒称新增 drain 已通过。
3. 作者随后发现部分安装时的新调用方与旧包装器接口可能不兼容；最终安装顺序先兼容的新 network，再 app/cutover，最后 release，与生成器顺序一致。

## 身份与验证来源

对 d71 生成包做过一次纯只读字节比较：manifest 身份与目标常量一致；17 项批准 runtime 文件 SHA 与主任务 runtime 仓库 `13131ee5425017b31ccf77741798a8dc37dbc936` 的文件全部匹配；7 个生成脚本 SHA 及 10 个内嵌 payload 与 d71 Ops 文件匹配。旧 manifest SHA 为 `37c4e8bec2ac662ca41eb16f7b3e557086054d64d9b37a03a287dc9ba920d086`。首次在 Ops clone 查找 runtime 文件失败，改为指定主任务 runtime clone 后完成静态比较；没有执行任何 payload。此包之后被安装顺序补丁和新 runtime 冻结取代，不得执行。

作者报告最终本机 controller 单测 119 项通过，以及较早生成包的摘要/语法检查；这些是作者动态或语法结果。测试中的 systemd、Docker、PostgreSQL 和生产进程调用使用替身，部分中断测试使用真实本机临时文件；不是生产演练，也不是本审查者独立动态复验。本次未复跑、未访问生产，不把此前被自动内容安全检查拦截的审查 turn 计为 PASS。

后续仍须固定新 runtime/RepoDigest/Ops commit、重新生成并核对发布包，按既有监督器执行实际备份及中断恢复演练，再分别验证精确域名浏览器与产品负责人操作。staging/production/main/tag 未因本证据提交改变，产品确认仍待主任务取得。


## 最终 c5aed41 / d16dc78 身份绑定

只读增量审查 Ops `d16dc78cae8ef67f24c0530f2705e2f81f27236c`，工作树干净；相对上述 `9eb83f4` 仅修改固定 TARGET 与 README，没有新增执行逻辑。TARGET 现固定 runtime `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`、tree `830e562f5ec56e99d7fc0b04432fc056dd772254`、release `native-portable-20260917-c5aed415cd17`、buildTime `2026-09-17T08:04:51Z`，与已核对的实际软件包一致。API/Web 的完整 RepoDigest 与主任务实际 push 回读逐项相同；未将旧 13131ee 包或本地标签当作此新身份。

实际读取 `/private/tmp/timeline-native-release-bundle-d16dc78`，manifest SHA-256 为 `dda79f493a4c9f9a29025da02a3c04c7c9e0130120239c332ad3a79bc950f318`。独立逐字节/AST literal 比较确认：17 个批准 runtime 路径 SHA 与最终冻结源码一致；7 个脚本 SHA、10 个内嵌 payload 的 SHA 和原文与 clean Ops 文件一致；7 个脚本内容与该 Ops commit 的模板及固定 literal 替换完全相同。安装旧单元摘要与指定 c33 源码一致；checkout 内 Ops commit、安装目标 commit、pull 镜像身份及各 driver 的依赖摘要也互相绑定。没有导入或执行控制器/生成器/发布脚本。

首次临时比较器在抽取 heredoc 后额外加了一行换行，导致 install 文本相等断言失败；修正审查比较器后原始模板字节完全相同，未修改被审源码或软件包。该诊断保留在相邻 `final-ops-identity-review-d16dc78.json`，不是生产或 controller 动态测试结果。

作者保存的最终本机记录报告 119 个 controller 测试及 7 脚本 shell/内嵌 Python 语法检查通过，脚本执行和生产访问均为 false；本审查者未重跑这 119 个测试。早先 rebind preflight 中的 `AWAITING_ACTUAL_PUSH_READBACK` 保留为推送前历史，不作当前摘要证据。限定增量范围未见剩余静态阻断，状态为 `FINAL_OPS_IDENTITY_STATIC_REVIEW_COMPLETE`；实际远端 ref 回读、备份、中断恢复演练、目标 URL 浏览器与产品确认仍分别由后续实测证明，不能用本节代替。


## 实际 socket 字段差异与 bf2cf83 原子修补

已只读检查主任务保存的实际失败和单元形状记录：d16 演练在保护备份目录建立前失败，state/API/Web 回到 `6c70a897ec7643f4681616d801481765aaa8f7bc`。两个固定 ingress socket 的实际 `systemctl show` 不含 MainPID，原 helper 直接索引导致 KeyError；原失败仍为 FAIL，不将监督器恢复旧程序称为新演练通过。本审查没有访问生产。

修复后的 `native_release_backup.py` SHA 为 `e1c7b96aaf7318080223280bdbfc97c1601a2b8036f9a4ccbcc2f3b400548c6e`：仅精确 `cutover.SOCKETS` 成员允许 MainPID 键缺失，空串或非零仍拒绝；APPS/PROXIES 保持显式 MainPID='0'，所有单元仍要求 inactive 与显式 ControlPID='0'。容器、数据库客户端/预备事务、NOLOGIN 和 Redis clean-stop 门禁未变。新增真实字段形状正向及七项负向在进入 SQL 前拒绝的回归代码已静态复核，未执行。

最终 Ops `bf2cf83a0bd172a6e9360d5e7f3533912a062813` 的独立修补仅接受已安装 d16 及旧安装 journal 的精确字节，固定目标主机/root 可信目录、全部旧依赖/unit 摘要、稳定 committed 6c70/no pending/no checkpoint、三个 release 单元 idle 且 FragmentPath/DropInPaths/NeedDaemonReload 正确。双非阻塞锁覆盖重新核对、原件保留、helper 替换和安装 journal 单一摘要更新；意图、两个原件、两个正式替换及完成记录均经过临时文件完整 fsync 后原子激活，中断残留不成为权威文件，重入只接受原/新精确状态。不重新启动、恢复数据库、清空 journal 或 reset 失败单元。本次静态未见上述有界路径剩余阻断。

实际旧安装回读文件 SHA `8fb7f3d77fbf1f5c717cc7fb8f1072dd29dc5fc4eb77d61758717f36265ad3a9` 中，helper `78b9299b...` 和安装 journal `52fd69be...` 与生成器重建值一致。新 release manifest 为 `bac905b93e2e54b3a40a2ace75dfdc683885161636fedd04c0cb71586197e7a6`，独立 repair manifest 为 `1c1bc79c0c9b6f6870e063a7e6c66d662dade27103ff086b8e6603d9bb4c8fb0`；七个 release 与一个 repair 脚本逐字节匹配最终模板及固定替换，两个 driver 的摘要与保存记录一致，固定 bf2/c5、IAP 目标，单步失败停止、无自动重试。两 driver 仍使用 assert，调用应为普通非优化 Python（建议 -I，不带 -O）。身份详情见相邻 JSON。首次独立重建比较器用不同字典插入顺序造成文本不等，按实际生成器顺序修正后精确匹配，未修改被审文件。

作者报告 126 个本机测试通过，包括六个写入点的半写/完整写后中断及重入、四类 guard 和 unit 合同；文件原子操作为本机真实临时文件，root/生产进程调用仍是替身。本审查者没有执行这些测试、导入控制器或运行修补/发布脚本。此次只提供技术审查，按主任务既有授权使用独立 repair 路径；旧通用 install 不应用于此已安装状态。修补安装、一次新的实际演练及其结果仍需另记，冻结应用 runtime c5 未变。
