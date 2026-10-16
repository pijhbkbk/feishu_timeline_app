# R27 公司源码扫描包清单

## 1. 目的与边界

本清单定义提交给公司 SAST 的第一方源码包。打包入口为：

```bash
SOURCE_COMMIT=<完整 40 位不可变 commit> \
  bash scripts/security/build-company-source-scan-package.sh
```

打包脚本只从指定 Git commit 的对象树读取文件，不从工作目录复制源码。若白名单范围存在已暂存、未暂存或未忽略的未跟踪源码，脚本会失败关闭，防止“扫描包内容”和声明的 `sourceCommit` 不一致。目标 commit 必须包含本打包脚本，且执行中脚本的 Git blob 必须与目标 commit 中的版本完全相同；因此不能使用工作树里的未提交打包器为旧 commit 生成正式包。

本包只用于第一方 SAST。第三方依赖不混入源码包，依赖漏洞由 SCA/SBOM 处理；Web/API/基础镜像由 Image Scan 处理；Secrets 扫描继续覆盖当前树、完整 Git 历史和批准的证据范围。三类结果不得互相替代。

## 2. 不可变版本身份

| 字段 | 当前 Gate 1 状态 |
|---|---|
| R27 治理基线 | `41b4b166c587692e6f0fb9536dca2e1aab646c70` |
| R26 production runtime/source | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| Placeholder 处置后的 runtime candidate | `359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c` |
| 最终 R27 `sourceCommit` | `27a0338ac0c59217d121fa6defe0feeec45ca252`；包含打包器和公司 SAST PDF 解析器 |
| 分支 | `security/r27-final-source-clearance` |
| production | 本 Gate 不部署、不改变 |

输出包名包含 `sourceCommit` 前 12 位，旁路 metadata 文件保存完整 40 位 commit、文件数和包 SHA-256。公司送扫前必须确认 metadata 中的 `sourceCommit` 等于批准的最终源码 commit。

## 3. 第一方白名单

打包候选仅来自下列 Git 路径；未列出的目录默认不进入公司源码包。

| 白名单 | 内容 |
|---|---|
| `apps/web/**` | Web 第一方源码、页面、组件、客户端、测试、静态产品资源和 Web 构建配置 |
| `apps/api/**` | API 第一方源码、DTO、守卫、服务、测试、Nest/TypeScript 配置和 API Dockerfile |
| `packages/shared/**` | 共享类型、枚举、常量、包清单和 TypeScript 配置 |
| `apps/api/prisma/schema.prisma` | Prisma 唯一模型源 |
| `apps/api/prisma/migrations/**/migration.sql` | 全量版本化 migration；非 migration SQL 不进入包 |
| `package.json`、`apps/*/package.json`、`packages/shared/package.json` | 根与工作区 package manifests |
| `pnpm-lock.yaml`、`pnpm-workspace.yaml` | 锁文件和 workspace 声明 |
| `tsconfig.base.json`、`**/tsconfig*.json` | TypeScript 配置 |
| `apps/api/Dockerfile`、`apps/web/Dockerfile`、`deploy/**/Dockerfile`、`.dockerignore`、`docker-compose.yml`、`deploy/*.yml` | 构建、镜像和 compose 定义 |
| `deploy/nginx/**`、`deploy/systemd/**` | Nginx 与 systemd 配置 |
| `scripts/**` | 第一方部署、迁移、安全、测试和运维脚本；脚本本身接受 SAST |
| `.github/workflows/**` | CI 配置 |

脚本对以下类别执行非空门禁：Web/API/shared 源码、项目审计日志正式路由、auth service、session store、session/cookie guard、Feishu CN OAuth provider、Web auth/session provider、Prisma schema、migration、根 package manifest、lockfile、TypeScript 配置、API/Web Dockerfile、Nginx、systemd、部署脚本、CI 和公司源码打包器自身。任一必需类别为空时停止，不生成包。

## 4. 强制排除项

以下内容不得进入包：

- `node_modules`、`.next`、`dist`、`build`；
- `coverage`、`test-results`、`playwright-report`；
- Python `__pycache__`、`.pytest_cache`、`.pyc`/`.pyo` 生成物；
- `reports`、`backups`、`var/backups`；
- `.env` 及其变体，包括示例环境文件；
- Playwright/browser auth state、session state/data、cookie/cookie jar 文件；
- `.dump`、`.bak`、`.backup`、SQLite/DB 文件和非 Prisma migration SQL；
- `.log`/`.out`/`.err`、`var/log`/`runtime-logs`/`artifacts/logs` 运行态目录、HAR、trace、SARIF 和未脱敏运行证据；业务源码中的 `.../logs/page.tsx` 不属于运行日志，必须进入包；
- 私钥、PEM、SSH key、credentials/service-account 文件；
- 原工作目录中的截图、PPT、PDF、数据库备份和其他设计/报告附件。

认证、Session、Cookie 和 OAuth 的 TypeScript 第一方实现仍属于安全敏感源码，必须进入 SAST；排除规则只匹配 `.auth` 运行目录以及 JSON/YAML/TXT 形式的 auth/storage/session/cookie state artifact，不匹配 `.ts`/`.tsx`，也不排除 `apps/api/src/modules/auth/**` 等实现代码。

打包前首先原样执行等价于以下强制预检的检查：

```bash
git ls-files | grep -E '(^|/)(node_modules|\.next|dist|coverage|test-results|var/backups)(/|$)'
```

命中即失败，不能靠打包过滤隐藏已跟踪的生成物。脚本还对目标 `sourceCommit` 的完整 Git tree 执行同一检查。

## 5. 可复现输出

默认输出目录为 `reports/security/r27/company-source-package/`，它不在白名单内，因而输出包不会自包含。每次输出：

| 文件 | 作用 |
|---|---|
| `company-source-scan-<commit12>.tar.gz` | 公司第一方源码扫描包 |
| `company-source-scan-<commit12>.contents.txt` | 包内路径清单 |
| `company-source-scan-<commit12>.excluded.txt` | 白名单候选中因敏感/运行态 artifact 规则排除的路径明细；只记录路径、不复制内容 |
| `company-source-scan-<commit12>.files.sha256` | 每个包内文件的 SHA-256 |
| `company-source-scan-<commit12>.tar.gz.sha256` | 压缩包 SHA-256 |
| `company-source-scan-<commit12>.metadata.txt` | 完整 commit、archive root、文件数、排除候选数和包 SHA-256 |

可复现约束：

- 文件内容直接读取指定 commit 的 Git blob；
- 路径顺序使用 Git tree 的 `C` locale 顺序；
- 文件 mode 只接受 `100644`/`100755`；其他 mode 失败关闭；
- owner/group 固定为 `root:root`（数值 `0:0`）；
- mtime 固定为 `2000-01-01 00:00:00`；
- tar 使用 `ustar`；gzip 使用 `-n -9`，不写当前时间和原文件名；
- archive root 固定为 `feishu-timeline-r27-company-source/`；
- 输出不记录可变 branch、生成时间或本机绝对路径。

## 6. 送扫前验证

候选 commit 形成并保持白名单工作树干净后执行两次：

```bash
SOURCE_COMMIT=<完整40位commit> bash scripts/security/build-company-source-scan-package.sh
cp reports/security/r27/company-source-package/company-source-scan-<commit12>.tar.gz /tmp/r27-first.tar.gz
SOURCE_COMMIT=<完整40位commit> bash scripts/security/build-company-source-scan-package.sh
cmp /tmp/r27-first.tar.gz reports/security/r27/company-source-package/company-source-scan-<commit12>.tar.gz
```

随后执行：

```bash
tar -tzf reports/security/r27/company-source-package/company-source-scan-<commit12>.tar.gz \
  > /tmp/r27-company-source-contents.txt

grep -E '(^|/)(node_modules|\.next|dist|build|coverage|test-results|playwright-report|reports|backups)(/|$)|(^|/)[^/]*\.env($|\.)' \
  /tmp/r27-company-source-contents.txt
```

验收要求：

- 两次压缩包 byte-for-byte 相同；
- 第二个 `grep` 无输出且退出码为 `1`；
- contents 与 tar 实际内容完全一致；
- archive SHA-256 与 `.tar.gz.sha256`、metadata 三方一致；
- metadata `sourceCommit` 为批准的完整 40 位 commit；
- 不含 `node_modules`、`.next` 或其他第三方/生成代码；
- 不含环境、认证状态、Cookie、数据库 dump、未脱敏日志、报告和附件；
- 包中至少存在 Web/API/shared、Prisma、package/lock、TypeScript、Docker、Nginx、systemd、deploy scripts 与 CI 各必需类别。

## 7. 当前闸门

Gate 0 批准的 Placeholder 处置已形成 runtime candidate
`359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c`。打包器和逐项解析器随后进入不可变
`sourceCommit=27a0338ac0c59217d121fa6defe0feeec45ca252`。正式公司源码包已经在共享独立
worktree 从该 commit 连续生成两次并复核；不是治理基线包、脏工作树包或隔离 clone 的机制测试包。

最终包身份：

| 项目 | 值 |
|---|---|
| archive | `company-source-scan-27a0338ac0c5.tar.gz` |
| archive size | `887239` bytes |
| archive SHA-256 | `83aff4f1474819ba370088418f018ddf1de29238d9745bf4139580f09864d940` |
| included files | `627` |
| excluded candidates | `3` |
| excluded paths | `apps/api/.env.example`、`apps/web/.env.example`、`deploy/env/staging.env.example` |
| run 1 vs run 2 | tar 与五个 sidecar 均 byte-for-byte identical |
| contents vs tar | `627 / 627`，完全一致 |
| per-file SHA-256 | `627 / 627` PASS |
| forbidden paths | `0` |

强制包含的项目审计日志路由、Auth service、Session store、Session guard、Feishu CN OAuth、Web auth
provider、Prisma、两个 Dockerfile、Nginx、systemd、CI、打包器和 PDF 解析器均已在最终 contents 中逐项核对。
该 tar 与 sidecar 位于被 Git 忽略的 `reports/security/r27/**` 交付区；机器可读的
`company-sast-findings.json` 因属于 Gate 2 必交证据，使用精确路径强制纳入版本控制。
这些报告/交付产物不属于扫描白名单，不会自包含。后续仅文档治理提交不改变此包的
627 个 Git blob。

```text
R27_GATE1_SOURCE_PACKAGE_COMPLETE
IMMUTABLE_SOURCE_COMMIT_BOUND
BYTE_REPRODUCIBLE
FORMAL_FIRST_PARTY_SAST_NOT_STARTED
PRODUCTION_UNCHANGED
```
