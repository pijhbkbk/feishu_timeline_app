# R27 Gate 4 SCA、SBOM、许可证与镜像初扫报告

## 结论

记录时间：`2026-08-10`（Asia/Shanghai）

```text
R27_GATE4_SCA=FAIL
PRODUCTION_DEPENDENCY_CRITICAL=0
PRODUCTION_DEPENDENCY_HIGH=2
PRODUCTION_DEPENDENCY_MEDIUM=0
DEV_DEPENDENCY_CRITICAL=0
DEV_DEPENDENCY_HIGH=2
LOCKFILE_UNIQUE_HIGH=3
API_IMAGE_CRITICAL=0
API_IMAGE_HIGH=3
WEB_IMAGE_CRITICAL=0
WEB_IMAGE_HIGH=3
POSTGRES_IMAGE_CRITICAL_HIGH=0
REDIS_IMAGE_CRITICAL_HIGH=0
NGINX_IMAGE_CRITICAL_HIGH=0
RUNTIME_IMAGE_DEV_DEPENDENCY_LEAKAGE=CONFIRMED
LICENSE_REVIEW_OPEN=YES
FIX_AND_RESCAN_REQUIRED
```

production dependency 和 production image 的 High 都不为 0，因此 Gate 4 不通过。这里没有把
“应用当前调用方式不容易触发漏洞 sink”当作关闭 advisory 的理由；最终公司准入目标要求生产
依赖和镜像 Critical/High 均为 0，必须升级、裁剪并复扫。

## 1. 扫描身份与范围

| 项目 | 值 |
|---|---|
| approved source commit | `27a0338ac0c59217d121fa6defe0feeec45ca252` |
| lockfile | approved commit 中的 `pnpm-lock.yaml` |
| package manager | pnpm `9.15.4` |
| OSV Scanner | `2.4.0` |
| image scanner | `ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f` |
| production dependency graph | 227 packages |
| development dependency graph | 248 packages |
| complete lock/SBOM inventory | 472 components |

镜像从 `27a0338...` 的临时 `git archive` 构建；没有使用当前治理 worktree 的未提交内容，
没有启动容器、服务或数据库，也没有部署 staging/production。

## 2. 依赖初扫结果

### 2.1 Production dependencies

```text
Critical=0
High=2
Medium=0
Low=0
```

| Advisory | Package | Installed | Fixed | Production path | 处置 |
|---|---|---:|---:|---|---|
| `GHSA-5p4m-2wfm-xmqj` | `js-yaml` | `4.3.0` | `4.3.1` | `@nestjs/swagger@11.4.5` | `DEPENDENCY_UPGRADE` |
| `CVE-2026-67213` / `GHSA-rgw5-rvv9-x895` | `nanoid` | `3.3.16` | `3.3.17+` | Next/PostCSS graph | `DEPENDENCY_UPGRADE` |

人工 reachability 复核显示当前 Swagger 路径调用 YAML dump 而非 load；PostCSS 路径传入固定正数
长度而不是 advisory 的零长度边界。但这只能说明当前已知调用面的可利用性较低，不能满足
production High = 0 的硬门禁。

### 2.2 Development dependencies

```text
Critical=0
High=2
Medium=0
Low=0
```

| Advisory | Package | Installed | Fixed | Development path |
|---|---|---:|---:|---|
| `CVE-2026-69152` / `GHSA-2v37-7h3g-55p8` | `brace-expansion` | `5.0.8` | `5.0.9` | ESLint/typescript-eslint graph |
| `CVE-2026-67213` | `nanoid` | `3.3.16` | `3.3.17+` | Vitest/Vite graph |

production 与 development 合并后共有 3 个唯一 High，不把同一 advisory 的多条依赖路径重复
计算为不同漏洞。

`pnpm audit`、OSV Scanner 对这 3 个 High 的包名、已安装版本和修复边界一致。

## 3. Production image 初扫

| Image | Build-time image ID/digest | Critical | High | 结果 |
|---|---|---:|---:|---|
| `feishu-timeline-api:r27-27a0338ac0c5` | `sha256:94bd3386c2d2ce3cfbbed91a4cd2a6c2db23b4c444ccde7c74be6d6af780dbf1` | 0 | 3 | BLOCKED |
| `feishu-timeline-web:r27-27a0338ac0c5` | `sha256:c4eeac2ec55621a9992118f8c8d5115c0cf18051acf2fa8b52b2e6f951779db4` | 0 | 3 | BLOCKED |
| `feishu-timeline-postgres:r27-27a0338ac0c5` | `sha256:e65bac11e87cd7f6f0d8eb33d5a68a0a26a5e125de771b7dcfa7a017084c69e8` | 0 | 0 | PASS |
| `redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` | fixed upstream digest | 0 | 0 | PASS |
| `nginx:stable-alpine@sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` | fixed upstream digest | 0 | 0 | PASS |

API 和 Web 镜像中的 3 个 High 完全相同：

| Package | Installed | Fixed version reported by image scan |
|---|---:|---|
| `brace-expansion` | `5.0.8` | `5.0.9`（或受支持分支对应修复版） |
| `js-yaml` | `4.3.0` | `4.3.1` |
| `nanoid` | `3.3.16` | `3.3.17+` |

## 4. Runtime image 开发依赖泄漏

两个应用 Dockerfile 都把构建阶段完整 workspace `/app/node_modules` 复制到 runtime。实际镜像
各包含约 394 个 pnpm store entry，其中包括 ESLint、Vitest、Playwright、Prisma CLI 和
上述 dev-only `brace-expansion`。因此：

- `brace-expansion` 虽在 lockfile 中属于 development graph，却真实进入 production image；
- API 和 Web 镜像攻击面、体积和许可证清单被不必要扩大；
- 只升级 production dependencies 不能让 image High 归零。

修复需改为 per-app production dependency graph。由于现有 compose 复用 API image 运行
`api-migrate` 和 `api-seed`，而这些命令依赖 Prisma/tsx 工具，不能简单删除全部 dev dependency；
应设计独立 ops/migration target 或最小化 operational dependency image，并保持 runtime image
只含实际运行所需依赖。

任何 Dockerfile/Node/Prisma/runtime dependency 变更都必须按 R27 风险矩阵重新构建并扫描
API/Web，验证启动、migration、health、完整生命周期，并依据最终变更决定是否执行
`5 VU × 2 小时` 认证耐久。

## 5. 建议依赖修复边界

当前验证过的最小版本方向：

- `js-yaml 4.3.0 → 4.3.1`；
- `brace-expansion 5.0.8 → 5.0.9`；
- `nanoid 3.3.16 → 3.3.17+`，或升级到实际传递图使用的已修复兼容版本；
- 可选 defense-in-depth：把 `cookie-signature 1.0.6` 升到 `1.2.2`，但不要把它计作当前
  advisory High。

不得只在 node_modules 中修改包，也不得用 ignore 隐藏 advisory。修复应通过 package manifest、
lockfile 和可重复安装完成；随后同时重跑 production-only、development、完整 lock 和五个镜像。

## 6. 历史 13 项 `NEEDS_SECURITY_REVIEW`

Gate 4 给出的逐项处置建议：

- 11 项指向当前 lockfile 已不存在的旧 Next/React 版本，建议 `NOT_IN_PRODUCTION`；
- 当前 React/Next action-state MD5 collision-context 语义不是认证/签名身份，且第一方源码中
  `useActionState`、`useFormState`、`"use server"`、form action 使用均为 0，建议
  `FALSE_POSITIVE`；
- `cookie-signature@1.0.6` 仍存在，但应用调用 `cookieParser()` 时没有 secret，也没有
  `signedCookies` 使用；SHA-1 compare 分支不进入 production 数据流，且 pnpm/OSV 无该包
  advisory，建议 `FALSE_POSITIVE`。

这 13 项的批准 JSON 在本 blocker 停点没有被改写，仍保持 Gate 2 已批准的
`NEEDS_SECURITY_REVIEW` 状态；上述内容是下次恢复后应写回逐项记录的证据和处置建议，避免在
正式 SAST 工具错误时制造“已全部关闭”的治理假象。

## 7. SBOM 与许可证

- 已从完整 lock graph 生成并重新解析一次 CycloneDX 1.6 临时 SBOM；OSV 对其仍得到相同 3 个
  High。该临时文件在审计后删除，不是最终交付 SBOM。
- 472 个组件中没有发现 AGPL、GPL-only、SSPL、BUSL、Elastic License 或 Commons Clause。
- 14 个 LGPL 表达式来自 Sharp/libvips 的可选平台包，需要法务/分发方式复核。
- `busboy` 和 `streamsearch` 的自动 inventory license 为 UNKNOWN，经包内容人工复核为 MIT；
  最终 SBOM/notice 应显式修正元数据并保留许可证文本。
- 仓库当前没有完整 `THIRD_PARTY_NOTICES`；许可证准入仍为 OPEN。

最终 SBOM、许可证清单和 notice 必须基于修复后的冻结 lockfile/runtime image 重生；当前临时
SBOM 只能证明扫描机制和初始依赖真相。

## 8. 当前停止点

```text
PRODUCTION_DEPENDENCY_CRITICAL_HIGH_ZERO=NO
PRODUCTION_IMAGE_CRITICAL_HIGH_ZERO=NO
FINAL_SBOM=NOT_PRODUCED
LICENSE_CLEARANCE=OPEN
DEPENDENCY_FIXES_STARTED=NO
IMAGE_FIXES_STARTED=NO
PRODUCTION_UNCHANGED
FIX_AND_RESCAN_REQUIRED
STOP_WITH_GATE3_BLOCKER
```
