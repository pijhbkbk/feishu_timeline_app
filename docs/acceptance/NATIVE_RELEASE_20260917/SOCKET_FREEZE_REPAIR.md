# 2026-09-17 socket 冻结检查修复

最终 runtime 仍为 `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，应用镜像及数据库模型不变。本次仅修运维 helper，不代表生产已更新。

## 实际失败与恢复

固定 d16 控制器安装成功。新增只读检查最初错误地要求全部 release unit 为 inactive；实际 `timeline-native-release-check.service` 保留 2026-09-14 01:55:11 至 01:55:42 UTC 的受控 SIGKILL（Invocation `052a043bb6b44429b6861b313695e8d3`，Code2/Status9）。原已审合同允许 inactive 或 failed，但要求 MainPID/ControlPID0、固定 FragmentPath、无 DropInPaths、NeedDaemonReload=no。确认旧记录后按原合同继续，未删除历史或扩大合同。

本轮首次 rehearsal 于 2026-09-17 08:58:34 UTC 开始，Invocation `8611860cee4a42e9a064b757ba20e8ed`，08:59:52 UTC 在检查点前以 KeyError 退出1；预定 SIGKILL 未执行。08:59:54 UTC ExecStopPost 成功返回0，自动选择原6c70，未恢复数据库、未重放迁移。09:01:13 UTC 只读确认 active=committed=`6c70a897ec7643f4681616d801481765aaa8f7bc`、pending=false，API/Web/Redis/入口均运行，API/Web元数据一致。

09:02:45 UTC 实际 systemctl 属性确认：两固定 socket 提供 ControlPID，但没有 MainPID；各 service 提供 MainPID。`native_release_backup.assert_frozen` 对 socket 直接索引 MainPID，造成 KeyError。保护函数先检查冻结状态，再创建备份目录；本日备份目录列表为空，没有本次保护收据。因此旧 rehearsal 保留 FAIL，不称备份或中断演练通过。

## 最小修复与验证

- 仅固定 `cutover.SOCKETS` 两项允许 MainPID 字段不存在；空值或非0仍拒绝。
- APPS/PROXIES 仍要求 MainPID 明确为0；所有单元仍要求 inactive 和 ControlPID 明确为0。
- API/Web容器消失、PG会话及prepared transaction为0、角色NOLOGIN、Redis正常退出门禁不变。
- 真实socket形状测试先复现 `KeyError: 'MainPID'`（RED），修复后通过（GREEN）；另有7组负向子例。
- `python3 -m unittest discover -s scripts/deploy/gce-host -p 'test_native_*.py'`：126项通过。新增原子修补测试覆盖6个写入点分别半写/完整持久化后的中断续装、保存原件、稳定状态/检查点/未知字节拒绝及未扩大的release unit合同。主机权限、systemd和DB调用仍为本地边界替身，不冒充生产动态结果。

## 精确修补安装

已安装旧 helper SHA256 `78b9299b5550997d2d939c5b2fc0205b6bd7e0ca620163771a061aede37e8f1a`，旧受保护安装 journal SHA256 `52fd69be9a0fae281801b5640714ca9184a1adcc00c9f5a9856ea02e36c82862`，均以实际读回为依据。新 helper SHA256 `e1c7b96aaf7318080223280bdbfc97c1601a2b8036f9a4ccbcc2f3b400548c6e`。

独立修补生成器仅从精确clean Ops commit生成内嵌脚本，要求除 helper 外所有安装文件与d16逐字相同。root脚本先核对所有已装d16摘要、稳定6c70/no pending/no checkpoint和无活跃release进程；同既有锁顺序保护写入，只原子替换该 helper 与安装journal中对应一项摘要。私有修补意图先持久化，保存旧helper及旧安装journal，半写仅留下未引用临时文件。续装接受同一固定意图的旧/新字节组合，未知版本拒绝。无服务停止/启动、迁移、seed、DB恢复、全机设置或其他应用变更。

本提交阶段仅本地实现/测试通过。实际固定包、独立审查、修补安装与修正后rehearsal结果另行记录；首次失败仍为FAIL。正式update须另待主任务确认实际rehearsal PASS。
