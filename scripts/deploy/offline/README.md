# 离线依赖的新目标准备入口

`install_runtime_debs.py` 负责固定 R30 的 20 个 deb payload 独占提取与完整验证。它不执行 `dpkg -i`、maintainer scripts、下载、数据库访问或服务启动。范围限定 Ubuntu 24.04 ARM64、UID/GID 1100、`/home/recovery` 直属目录及已认证的精确 122 包基线和三项版本更新。

本入口替代新安装时对旧失败链的依赖。旧 R02 提取和 R03 保留树复验的回执仍是历史证据，不能复制或修改为新目标发生的事实。

## 输入和信任边界

调用者须在此程序之外核对代码、来源包、目标授权、宿主预算读取器及其依赖链。代码自行生成的摘要只标识文件，不授予执行权限。不要对现有运行前缀重复安装。

新 `INPUT` 目录只放批准的公开输入，UID 1100、禁止 group/world 写入：

- 原固定 `selection.json`（`35784a08…`）与 `payload-entries.json`（`c79a86ad…`）。前者的旧路径和观察时间仅作为来源记录；实际目的路径由新绑定确定。
- `base-update-overlay.json`（`7ce7c823…`）及其列明的全部七份公开来源证明；精确三个系统版本及当前文件内容仍实际核对，不安装系统包。
- `host-budget-policy.json`：独立核对后的完整宿主分母及读取器摘要。结构为 `kind=OFFLINE_HOST_BUDGET_SCOPE_V1`、`limit=25769803776`、`expectedRootPaths`、`reader`。`reader` 含 `entrySha256` 和 `dependencies`（每项 `name`、`sha256`）。路径必须是完整独立统计根，不遗漏 VM、缓存、工具及本任务历轮证据；集合限 4096 项、JSON 限 4 MiB。
- 执行前生成的 `budget.json`：实际 `at`、`limit`、`reader`、`scopeNarrowed=false`、`rows`（`path`、`allocatedBytes`）、`totalAllocatedBytes`。`reader` 必须与已认证 policy 完全相同，rows 的完整集合和总和必须相符。宿主包装负责真正运行并验证该读取器；仅把摘要写进 JSON 不构成执行证明。

`BASE` 是本目标已验证的原 R27 基包目录，含其实际 `INSTALL-RECEIPT.json`、固定 `dependencies/base-prerequisites.json` 和 20 个原始 deb。调用者提供该目标实际回执的完整 SHA。程序核对 R27 archive/manifest/身份/数量和目标路径，并另核固定 deb 全字节；不要求旧目标的回执摘要、boot 或失败 PID。

## 两个阶段

以下为命令结构；参数必须是已审查的实际路径及完整摘要，不能原样执行占位符。

```text
python3 -I -B install_runtime_debs.py prepare-target \
  --input INPUT --base BASE --target NEW_PREFIX --output NEW_EVIDENCE \
  --base-install-sha256 ACTUAL_BASE_RECEIPT_SHA \
  --budget-policy-sha256 REVIEWED_COMPLETE_HOST_POLICY_SHA

python3 -I -B install_runtime_debs.py install --execute \
  --input INPUT --binding-sha256 REVIEWED_NEW_TARGET_BINDING_SHA \
  --budget-sha256 FRESH_ACTUAL_BUDGET_SHA
```

`prepare-target` 只独占写入 `INPUT/target-binding.json`，采集当前 hostname/boot/平台及新路径，返回摘要供外部核对。`NEW_PREFIX`、`NEW_EVIDENCE` 必须不存在；四个目录互不相同。新绑定不能授权自己。`install` 缺少 `--execute` 时只报告 PLAN，不读取目标。

执行再次核对当前 boot 和完整绑定。宿主预算不得超过 24 GiB，预留 320 MiB；guest 执行前须至少有 1 GiB + 320 MiB。全过程维持 1 GiB 空间底线、payload 256 MiB 和证据 16 MiB 停线。超时、失败、已存在目标一律拒绝并保留，不自动删除或重试。

成功结果必须来自本次真实 20 包提取、完整树读回、134 个 ELF loader 与 9 个版本命令。canonical-first 库归属和同次 PID/root/base 匿名根验证复用最终修复，不允许未知库或系统中的同名 20 包库回退。正常 pidfd/SIGTERM 收尾保留。

若本次只验证新提取入口，可显式加 `--defer-native-checks`：仍实际检查精确基础包、20 包全部提取和完整树前后读回，但不重复 loader/版本命令。该阶段只写 `FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED`，`nativeChecks=NOT_EXECUTED`、`loader=null`；不能作为原生运行准入或把旧 loader 结果改标为新执行。默认完整模式不变，后续运行仍需要相应真实证据。

## 当前验证边界

此组件已有本机边界测试以及保留的实际 loader/owner 输出的纯解析回归。临时路径测试仅模拟 Linux UID，不能证明新目标实际权限、安装或运行。新目标宿主包装、联合 app/scanner 配置与生命周期适配另行完成；本文件不是整套软件的最终 INSTALL，也不宣称 A15-09 完成。

本机目标检查：

```text
python3 -I -B scripts/deploy/offline/test_install_runtime_debs.py -v
```
