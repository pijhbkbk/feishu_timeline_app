# 项目代码集中保存与分支合并（2026-10-16）

本轮按所有者明确要求，将本机本项目已有分支、独立运维分支和未提交源码集中到根工作区，推送 GitHub 并合并 main，停止闲置本地 Docker 环境并降低磁盘占用。本记录固定源码、验证身份、未关闭风险及清理收据；原始备份和日志保留在本机私有审计目录。

## 源码身份与完整性

- 原 main / origin/main：`41b4b166c587692e6f0fb9536dca2e1aab646c70`。
- 整合分支：`codex/consolidate-all-20261016`。
- 应用与测试整合提交：`c593d6509660eff2da9ff21a389e4c0202987406`；后续 CI 修复单独记录。本报告属于文档证据提交，不冒充应用 runtime commit。
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

### GitHub 实测结果与保留风险

CI 修复提交为 `26c027e340a3fa94bb3134f3fd40fb65e6962ef7`。其 PR run `38864643581` 的 install、lint、typecheck、测试（含历史控制器回归）、Web build、生产构建产物检查、API build、Prisma validate 和 Compose config 均成功。

远端 verify 仍为 FAIL：API 镜像固定要求 `libcrypto3=3.5.8-r0` / `libssl3=3.5.8-r0`，当次 Alpine 索引仅提供 `3.5.7-r0`，构建在安装系统包时关闭；Web 镜像及镜像扫描随后 SKIPPED。没有降低 OpenSSL 版本、删除版本门禁或把未构建镜像报 PASS。本轮不交付新的运行镜像。

远端 security-source 为 FAIL，准确结果保留：

- Gitleaks current/history 各 45 候选。独立复核与本轮已闭合的 49 项对应；少 4 项为原有内联豁免的公开指纹/摘要。确认新凭据 0；原扫描退出码没有改成 PASS，也没有为本轮扩大豁免。
- Semgrep 6 候选经独立上下文复核为既有公开签名目录权限、负向夹具、私有 `0700` 目录及固定 16 字节 GCM tag 等上下文问题；仍有 3 个扫描器错误，扫描完整性未闭合，不计 PASS。
- SCA 全部依赖 13 命中；生产依赖 8 命中（1 Critical、2 High、5 Medium）。锁文件与最新 light-truck 分支逐字相同，这些结果不被本轮整合或历史 PASS 豁免。

以下为向唯一 `docs/security/FINDINGS.yaml` 导入的候选建议，仍需按其 schema 研判适用性和修复；不是第二套状态账本，也不是风险接受或已关闭结论。

| 生产依赖 | Advisory | CI 等级 |
| --- | --- | --- |
| uuid | GHSA-w5hq-g745-h8pq | Medium |
| multer | GHSA-3pph-fpjx-jg34 | Medium |
| js-yaml | GHSA-r3ph-w7gj-g6xm | Medium |
| source-map-js | GHSA-68fv-2mgg-jv7q | High |
| proxy-addr | GHSA-jqcg-44mw-7w3h | Critical |
| sharp | GHSA-wq5f-xc86-pv6w | High |
| next | GHSA-4jqv-mc3x-m676 | Medium |
| next | GHSA-mcj8-r9mp-w47p | Medium |

独立审查结论仅允许在 GitHub 真实保护允许时集中合并源码；没有赋予绕过 required checks 的权限。PR [#2](https://github.com/pijhbkbk/feishu_timeline_app/pull/2) 已由 GitHub 正常 merge，提交 `fd4834986926770bb1959fcaee936e8c663844f9`，根工作区随后同步为 main / origin/main 同一提交。状态为 `MAIN_MERGED / NOT_RELEASE_READY / NOT_DEPLOYED`，不能表述为安全 CI 全绿或产品发布通过。

## 独立复核与推送前检查

- 独立分支完整性复核：94 原引用、4 快照及 detached commit 全覆盖；来源引用和原脏工作树未变。
- 独立安全差异复核：最新关键业务和发布控制器保持，旧安全分支的有效防护已保留；未发现本次整合引入的确定安全阻断。
- 对代码提交精确树 1932 文件及相对原 main 新增的 238 个提交历史扫描。Gitleaks 两次均 exit 1、49 个候选，经逐项研判均为完整性摘要、公开密钥指纹或 commit 等既有非凭据值；确认 Secret 0、未研判 0。没有扩大 allowlist 来制造通过。
- 精确新增文件与既有 HAR/日志/截图已按本项目发布范围复核；本轮未将未跟踪媒体或忽略凭据纳入扫描。此为有界差异检查，不等于全仓安全认证或组织批准。

原始命令、退出码、输入与日志 SHA256、独立复核、refs 覆盖与工作树备份清单保留在本机私有目录 `/private/tmp/timeline-consolidation-20261016/`。原始日志和备份未发布到公开仓库。

## 磁盘清理实际结果

在 GitHub main 合并且根目录同步后，对精确白名单执行清理。21 个旧 color release 的 161 个目录、6 个旧工作树的 17 个目录共 178 项已全部移除，仅包含 `node_modules`、`.next` 和已核对的 `dist`。目录逻辑占用估算合计 43.434 GiB；APFS 和依赖硬链接共享导致实际释放量不同。

| 观察项 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 项目根目录 du | 46.45 GiB（48,701,656 KiB） | 8.08 GiB（8,473,808 KiB），约下降 83% |
| color release 集合 | 37.28 GiB | 1.10 GiB，源码与证据保留 |
| 整机可用空间 | 初始约 35.63 GiB | 后续快照约 64.47 GiB（持续变化的整机观测） |
| 运行 Docker 容器 | 4 | 0 |
| Docker 容器 / 镜像 / 数据卷数量 | 62 / 111 / 64 | 62 / 111 / 64 |

删除收据的即时空间差为 `23,941,922,816` bytes，即 22.30 GiB；后续系统空间回收后可用空间继续增加。整机快照还受系统回收和其他进程影响，不能与目录逻辑大小相加。另清理一周未使用的 Docker 构建缓存、保留至少 5GB 缓存，Docker 报告回收约 1.07GB；该值与共享镜像层不重复相加。

停止的容器为 `timeline-sheets-20261013-scanner`、`timeline-m1-20261008-scanner`、`timeline-m1-20261008-redis`、`timeline-m1-20261008-postgres`。它们的标签与挂载均确认属于本项目旧验证环境，restart policy 原为 `no`，保留原值及全部容器/数据库卷。无 image/volume/system 全局 prune；保留已有恢复镜像，当前镜像重建失败边界见上文。

删除前后 45,817 个保留源码文件 SHA256 完全一致。独立复核确认 178 个候选路径全部不存在，根目录当前依赖和构建仍在，21 份 release 的源码、Prisma、锁文件、构建身份、manifest 和 `.color-register-build` 仍在。数据库、对象、备份、runtime、原始验收证据及来源工作树未提交源码均未作为缓存删除。20 份依赖包内 `.env` 与根目录同版本 dotenv-cli 的 145 字节包文件 SHA256 一致后才解除保留；未读取或删除项目真实环境配置。

本机收据：`generated-cleanup-receipt.json`，SHA256 `0603b1fa1608274c18bd1ccffd10b8ea5d46e53632d4fe9776d32b500736c878`；独立结果为 `generated-cleanup-independent-verification.json`，均在上述私有审计目录。另有 `final-main-consolidation-proof.json` 证明 94 原引用、4 快照与 detached 提交全覆盖，原引用除 main 的预期更新外无漂移。清理后应用、Prisma 和依赖输入继续与最新 light-truck 分支逐字相等。

本轮未迁移持久化数据到外置盘；通过清理可重建副本释放空间。后续开发以根工作区为主，旧副本若需启动须从其已保存的确切提交重新安装/构建；不可把缓存已删除的历史目录当作仍可直接运行的不可变制品。

## 环境与交付边界

| 项目 | 本轮准确状态 |
| --- | --- |
| 代码集中与必要兼容修复 | CODE_IMPLEMENTED |
| 本地质量与有界回归 | LOCAL_VERIFIED；185 API 检查跳过 |
| staging URL / runtime / 用户路径 | 未执行，不适用 |
| production | 未改变；未访问 `https://timeline.all-too-well.com`，runtime 未核验，用户路径未执行 |
| GitHub / main | PR #2 已合并为 `fd4834986926770bb1959fcaee936e8c663844f9`，后续纯文档收据提交单独记录；全部源码历史保留 |
| tag | 未改变 |
| 产品负责人 | AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 路由 | 本轮未新增或修改产品路由，未执行新的浏览器验收，既有验收缺口保留 |
| 磁盘阶段 | 178 项缓存清理及独立复核 PASS；4 容器停止，64 数据卷保留；项目根目录 46.45→8.08 GiB |

未获得产品负责人实际确认，不宣称网站更新、产品验收通过或正式发布完成。
