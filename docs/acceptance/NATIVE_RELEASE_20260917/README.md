# 固定 GCE 原生程序更新工程（本地工程）

这是从已提交 `6c70a897ec7643f4681616d801481765aaa8f7bc` 更新程序的运维源码；不重新初始化账号、执行 migration、恢复数据库或回到初始 f2da。Ops commit 与最终 runtime commit 分开记录。最终目标已按主任务实际不可变构建/私有推送读回固定在 `native_release_target.py`：runtime `13131ee5425017b31ccf77741798a8dc37dbc936`、tree `14001bed5b79c89f2bed9289932adbf876f8d03d`、buildTime `2026-09-17T06:59:30Z`、release `native-portable-20260917-13131ee54250`；API RepoDigest `872e6b8d0800546f51a986ddf03e0b5d2d65c250fa4911b95549c3774a72fc91`、Web RepoDigest `b7b86f39893dce2e49a6f90f6f655e63cd0a4c4043735a5d0cb18ca9592a17e5`。没有把未读回的Image ID当仓库摘要。

主任务于 2026-09-17 06:51:59Z 经既有 IAP 只读证实：原 `release-6c70-state.json` version1、active=committed=6c70、pending=false，旧控制器摘要、镜像、clean checkout、API/Web运行元数据、入口及扫描器符合旧记录。该只读结果没有给本分任务生产写操作事实；本分任务没有访问或修改生产。

## 更新边界

- 保留原 state 文件名与 schema，新控制器拒绝缺状态或 f2da 状态，不再默认选择初始程序。API自有容器停止期限65秒，固定Docker包装器80秒，API systemd停止期限90秒，固定systemctl包装器110秒；非API命令保留原45秒包装器预算，覆盖新45秒drain预算，Web保留20秒。新API受控停止非0/OOM不称drain成功，不进入一致备份；旧6c70仅记录进程冻结事实与实际退出码。API/Web 环境仅变更构建身份，数据库、对象根、Redis、Origin、Cookie、扫描地址、配额不变。
- 精确 checkout commit/tree 固定全部源码；额外核对 API 等受控路径变化列表与逐文件摘要。允许本轮 drain、dashboard count、fresh catalog 正式 CLI及其测试/目录提取；`apps/api/package.json` 除已固定脚本注册外所有字段必须不变。schema、migrations、锁文件、依赖、shared、ops镜像定义等不能混入未批准差异。不保留“API全无差异”旧断言。
- 先校验已运行旧程序、固定新镜像、环境与源码，再持久化 pending。关闭本系统入口及 API/Web、冻结 promoted native role、正常停止本系统专用Redis。在全体写入者退出且无 prepared transaction 后，仅导出该native数据库、自有对象和专用Redis持久文件。对象沿用有界 fd 遍历，拒绝链接和越界，快照前后数据库全表/序列/DDL一致。
- 备份保存在原root受保护目录，含账号哈希/业务信息/Redis会话，不能当软件包或公开证据。凭据引用保留原root文件，不输出到日志。Redis文件仅为本机受控保护，不存在自动恢复/复活会话的命令。
- 起新程序前恢复专用依赖；私有健康检查及容器身份通过后，比对原数据库指纹、原对象字节及保护包摘要才提交。后台消费者若确实写入，也会停下来调查，不排除通知表、覆盖旧指纹或恢复数据凑通过。
- 中断恢复沿用既有固定cutover监督器，只选择 pending 中记录的前一个原生程序并恢复专用依赖。已committed的新版本不会因普通recover自动回退。显式rollback同样需要新的受保护快照，兼容停止/不存在的新API/Web容器；不回放初始迁移，不整机导出，不修改共享应用。

## 固定发布工具

`build_native_release_bundle.py` 只能从精确干净Ops commit、已填完整固定目标身份生成脚本，不执行云端命令。生成的软件包包括：

1. `checkout`：以既有lixiaochen用户核实私有VM上精确runtime/ops refs后，创建或核实0700不可变checkout；不移动旧refs/main/tag。
2. `pull`：只拉固定私有registry RepoDigest，核对架构与四项标签；临时registry认证材料在finally删除。
3. `install`：root可信内嵌payload与SHA，不从低权限checkout导入代码；校验所有旧依赖摘要，保留旧控制器/units；journal/helper/保留原件均完整临时文件fsync后原子激活，原子替换支持写中中断续装，按新network兼容层→app→cutover→release顺序避免写中断时新调用者使用旧接口；安装不启动发布或修改state。
4. `rehearse`：备份完成、程序关闭、新版本pending后，在绑定的systemd invocation/PID/checkpoint执行受控SIGKILL；核实监督器自动回到6c70、备份/数据不变。不是整机重启证明。
5. `update`：必须有同目标的实际演练证明。固定systemd单元执行更新，结合controller日志和PID1成功退出记录证明完成，保留对应备份引用。
6. `rollback`：明确从稳定最终版本退回稳定6c70，仅程序，不恢复数据库。
7. `proof`：复核精确源码、镜像、state、环境、健康元数据、Nginx与备份；仍将精确域名浏览器验收/产品负责人确认列为待执行。

最终runtime/ops refs分别为 `refs/heads/codex/native-portable-release-20260917` 与 `refs/heads/codex/native-portable-ops-20260917`；只在 `/home/lixiaochen/timeline-native-delivery/source.git` 由主任务实际推送并读回后使用。CLI示例在候选定稿且Ops提交后为：

```sh
python3 scripts/deploy/gce-host/build_native_release_bundle.py \
  --operations-commit <实际完整Ops提交> --output <新的私有目录>
```

上述占位参数不是现成已生成脚本，不构成发布已执行。

## 本地验证与范围

`python3 -m unittest discover -s scripts/deploy/gce-host -p 'test_native_*.py'`：119项通过，包括既有备份/迁移边界以及新增程序升级、缺状态拒绝、数据变动拒绝、专用范围、异常Redis出口、19个安装写入点分别在半写及完整持久化之后中断的真实本机文件续装。生产进程/systemd/Docker/PG调用均为测试边界替身；不是在生产或第二台主机上实际演练。原历史两个测试的fixture由隐式f2da缺状态改为显式6c70；有界输出测试使用当前Python解释器避免触碰本机Xcode许可，断言未减弱。

独立安全审查由fresh_catalog执行，只静态审查，未新增或执行攻击复现。最终常量已固定；生成包摘要、实际生产演练与浏览器记录在完成时另附，未执行不得记PASS。
