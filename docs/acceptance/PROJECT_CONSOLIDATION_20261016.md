# 项目代码集中保存与分支合并（2026-10-16）

本轮按所有者明确要求，将本机本项目已有分支、独立运维分支和未提交源码集中到根工作区，推送 GitHub 并合并 main。另按追加要求停止闲置本地 Docker 环境、降低磁盘占用；本记录先固定源码与验证身份，清理结果以本机清理收据和最终报告为准。

## 源码身份与完整性

- 原 main / origin/main：`41b4b166c587692e6f0fb9536dca2e1aab646c70`。
- 整合分支：`codex/consolidate-all-20261016`。
- 最终代码提交：`c593d6509660eff2da9ff21a389e4c0202987406`；本报告属于后续文档证据提交，不冒充应用 runtime commit。
- 原始 57 个本地分支及 37 个远端引用共 94 个引用的原提交全部成为整合提交祖先；原分支未删除、未改写。另纳入一个尚未被分支覆盖的 detached review 提交。
- 根工作区原有 4 份待提交文档先单独 checkpoint；其他 4 个有修改的工作树使用独立索引生成快照，不改变来源工作树的 HEAD、索引或文件。原补丁及完整 refs bundle 保留在本机私有备份目录。
- 最新应用来源 `codex/light-truck-sheets-02-04`：`73cda37133d9a21501f9091b4a1c5414a4f4a15a`；其应用 runtime 源码提交为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`。整合后的 `apps/api`、`apps/api-ops`、`apps/web`、`packages/shared`、Prisma、根依赖与锁文件均与最新分支逐字一致。
- 运维来源：`9eb94093df6c15df3600f9ddeb22ea92c7db67af`，保留 37→41 和 41→41 的受控发布、迁移和恢复门禁。
- 较旧治理来源：`3ddd58e7712151155f3e93cb1858f73ee0044d51`、`b932b6818ebf1e0d5fe60e83e85aed5cc24ab2f9`。冲突按当前原生认证、最新安全和治理合同处理，未把旧 OAuth、旧 V2 路由或较弱发布控制器重新接入。
- 较旧 detached 草案 `541ef0215e3cd2aa2240d35ce755246cec40ce9d` 的历史保留，后续更强版本的文件保持。

| 未提交源码来源 | 快照提交 | 安全纳入文件数 |
| --- | --- | ---: |
| r27-governance | `f22da6cbc35c55bad6e892ee67780be3709b87a6` | 8 |
| r27-security | `37e35b030767574b06f7a4390b2d3fb03e64528e` | 39 |
| r27rc2-docs | `e3767977459d4c6065e2906f38199e3c8653fd28` | 4 |
| standard-governance | `48c0d96740217a11cdfa51b5ebc48deaa5e71d2d` | 9 |

来源冲突的有用改动纳入当前文件；旧独立 Web 制品辅助脚本保存在 `scripts/deploy/legacy-r27/` 并明确为历史参考，没有接入当前构建。四份根目录用户媒体未读取、扫描或提交。凭据、数据库备份、依赖、构建缓存、未脱敏日志及生成的许可证/SBOM 报告未进入本次新增源码提交。

## 本轮必要兼容处理

- 保留旧安全分支中查询参数不落访问日志的 Nginx 配置、隔离运行用户与 systemd 限制，以及独立备份、数据解析与发布核查工具。
- 新旧 dotenv 解析配置按当前原生认证生成器补齐精确键集合，保留 Web 拒绝数据库凭据、禁止 Node 注入和 shell 不求值边界；新增 6 个有界回归并纳入 CI。
- 旧测试对已被 41 迁移门禁替代的入口有过时假设。本轮只更新测试夹具及入口断言，保留旧直接函数的历史覆盖，增加当前缺少 commit / migration / schema 的拒绝路径；不改生产控制器或放松断言。
- Shell 回归分别验证联网前的参数拒绝与真实响应后的指标拒绝，原有无网络、无注入断言完整保留。

## 本地验证

环境：本机隔离检查，Node `24.14.0`、pnpm `9.15.4`。未连接生产数据库、未执行部署。

| 检查 | 最终结果 |
| --- | --- |
| pnpm install --frozen-lockfile | PASS，锁文件未变 |
| pnpm lint | PASS |
| pnpm typecheck | PASS |
| pnpm test / Web | 563 PASS，94 文件 |
| pnpm test / API | 1621 PASS，185 SKIPPED；SKIPPED 不计 PASS |
| shared build、Web build、API build | PASS |
| Prisma validate | PASS；schema / migrations 与最新分支相同 |
| GCE 发布控制器 Python 回归 | 279 PASS，0 SKIPPED |
| 整合 dotenv / Nginx 配置回归 | 6 PASS，0 SKIPPED |
| release identity Node 回归 | 18 PASS，0 SKIPPED |
| release identity health Shell 回归 | PASS |
| deployment security hardening Shell 回归 | PASS，经独立复核的新根因修复后恢复执行 |
| Placeholder 必需扫描 | 12 命中，均为测试/夹具/负向断言；正式页面占位 0 |

最初 typecheck 因旧 `.next/types` 残留已删除路由而失败，正常 Web 构建后重检通过。最初 API 测试因沙箱禁止 loopback 监听而失败，获得实际平台权限后以相同命令通过。Python 首轮失败反映旧测试入口假设，修复后完整回归通过。Shell 同一门禁连续两次失败后已暂停并留存 blocker；独立审查确认新的具体根因修复保留原断言后，才恢复有界验证并通过。全部原始 FAIL 证据保留，不被最终 PASS 覆盖。

应用、迁移、依赖和锁文件输入未变，因此代码提交后的纯文档证据提交可复用这些检查；不把本地编译当作已部署制品。

### GitHub 首轮检查补充

首轮 push 与 PR 两次并行 CI 的 verify 均在运维历史重建测试失败：默认浅 checkout 不包含测试所固定的历史控制器 commit（279 项测试中 119 个错误）。本机完整历史的 279 PASS 不被改写为远端 PASS。本轮将 verify checkout 明确设为 `fetch-depth: 0`，使其获得回归所需历史，与既有 security-source job 一致；未改测试断言、未跳过用例。修复后的远端检查状态以 PR 对应的新 head 为准。

## 独立复核与推送前检查

- 独立分支完整性复核：94 原引用、4 快照及 detached commit 全覆盖；来源引用和原脏工作树未变。
- 独立安全差异复核：最新关键业务和发布控制器保持，旧安全分支的有效防护已保留；未发现本次整合引入的确定安全阻断。
- 对代码提交精确树 1932 文件及相对原 main 新增的 238 个提交历史扫描。Gitleaks 两次均 exit 1、49 个候选，经逐项研判均为完整性摘要、公开密钥指纹或 commit 等既有非凭据值；确认 Secret 0、未研判 0。没有扩大 allowlist 来制造通过。
- 精确新增文件与既有 HAR/日志/截图已按本项目发布范围复核；本轮未将未跟踪媒体或忽略凭据纳入扫描。此为有界差异检查，不等于全仓安全认证或组织批准。

原始命令、退出码、输入与日志 SHA256、独立复核、refs 覆盖与工作树备份清单保留在本机私有目录 `/private/tmp/timeline-consolidation-20261016/`。原始日志和备份未发布到公开仓库。

## 环境与交付边界

| 项目 | 本轮准确状态 |
| --- | --- |
| 代码集中与必要兼容修复 | CODE_IMPLEMENTED |
| 本地质量与有界回归 | LOCAL_VERIFIED；185 API 检查跳过 |
| staging URL / runtime / 用户路径 | 未执行，不适用 |
| production | 未改变；未访问 `https://timeline.all-too-well.com`，runtime 未核验，用户路径未执行 |
| GitHub / main | 本文提交时待推送和 PR 合并；最终 merge SHA 以 GitHub 和根工作区回读为准 |
| tag | 未改变 |
| 产品负责人 | AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 路由 | 本轮未新增或修改产品路由，未执行新的浏览器验收，既有验收缺口保留 |
| 磁盘阶段 | 仅停止本项目闲置容器并清理逐项核对的可重建文件；数据库、对象、原始证据、来源工作树源码和 Git 历史保留 |

未获得产品负责人实际确认，不宣称网站更新、产品验收通过或正式发布完成。
