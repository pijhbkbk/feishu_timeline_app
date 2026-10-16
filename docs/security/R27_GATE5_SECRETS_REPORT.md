# R27 Gate 5 Secrets 全树、历史与媒体扫描报告

## 结论

记录时间：`2026-08-10`（Asia/Shanghai）

```text
GATE5_SECRETS_RESULT=PASS
CONFIRMED_SECRET_FINDINGS=0
CURRENT_APPROVED_SOURCE_COMMIT_FINDINGS=0
CURRENT_HEAD_FINDINGS=0
FULL_GIT_HISTORY_FINDINGS=0
UNTRIAGED_SECRET_CANDIDATES=0
TRACKED_MEDIA_SECRET_FINDINGS=0
REPORT_AND_SOURCE_PACKAGE_SECRET_FINDINGS=0
SECRET_ROTATION_REQUIRED=NO
```

Gate 5 对批准 source commit、当前 evidence HEAD、全部有效 refs/reflogs 历史、tracked env/example、
脚本、文档、报告、源码 archive 和已跟踪媒体完成独立 secrets 审计。没有发现确认的 Secret、
Cookie、Session、OAuth token、private key 或生产 credential。

原仓库中的四个未跟踪用户设计草图不是项目文件，没有进入 R27 独立 worktree，也没有被读取、
扫描、移动、忽略或提交。

## 1. 身份与工具

| 项目 | 值 |
|---|---|
| worktree | `/Users/lixiaochen/Downloads/feishu_timeline_app-r27-security` |
| branch | `security/r27-final-source-clearance` |
| scan-start HEAD | `4a1b4abfbb1d18278ca8438c0b1d1085243e2daf` |
| approved source commit | `27a0338ac0c59217d121fa6defe0feeec45ca252` |
| repository shallow | `false` |
| valid refs commits | 196 |
| refs + reflogs commits | 198 |
| local refs | 77 |
| tracked files at HEAD | 1176 |
| files at approved source commit | 1172 |
| nonignored untracked files in R27 worktree | 0 |
| Gitleaks | `8.30.1` |

扫描范围包括：

- `27a0338...` 精确 Git tree；
- 当前 evidence HEAD tree；
- `--all --full-history`；
- `--all --reflog --full-history`；
- 忽略内联 `gitleaks:allow` 的独立复扫；
- 删除仓库 allowlist、只使用 Gitleaks 官方默认规则的独立复扫；
- 补充 PEM/JWT/AWS/Google/GitHub/GitLab/Slack/OpenAI/Stripe/Bearer/Basic-auth URL 和
  sensitive-assignment 规则；
- tracked 二进制字符串、图片/PDF/PPTX/视频 OCR；
- 当前 R27 reports 和源码 archive，archive traversal depth `1`。

## 2. Gitleaks 结果

仓库 `.gitleaks.toml` 使用 `useDefault = true`，只有一个窄 allowlist；没有路径级、目录级或
通用 secret 规则屏蔽。

| 扫描 | Findings |
|---|---:|
| 当前 HEAD tree，仓库配置 | 0 |
| 当前 HEAD tree，忽略内联 allow | 0 |
| approved source tree，忽略内联 allow | 0 |
| 所有 refs 完整历史 | 0 |
| 所有 refs + reflogs 完整历史 | 0 |
| 当前 R27 reports + source archive depth 1 | 0 |
| tracked binary strings | 0 |

移除仓库 allowlist 后，source tree 和完整历史都只出现同一个候选：

| Rule | Commit | 路径 | 行 | 脱敏指纹 | 处置 |
|---|---|---|---:|---|---|
| `generic-api-key` | `022cc86a3b8ae8ec129e5f34a96d0e6bce71690d` | `docs/product/R26_PRODUCTION_RELEASE_20260730.md` | 11 | `0c1adc5dfdeec466` | `FALSE_POSITIVE_PUBLISHED_BUILD_INTEGRITY_SHA256` |

该行是标签加 64 位十六进制 API dist SHA-256 完整性元数据，不是 API key、credential、token
或 secret。因此现有窄 allowlist 没有隐藏真实凭据。

## 3. Environment 与敏感键名复核

已跟踪的环境示例文件只有：

```text
.env.example
.env.production.example
apps/api/.env.example
apps/web/.env.example
deploy/env/staging.env.example
```

没有 tracked 真实 `.env`、PEM/private key、P12/PFX、keystore、HAR、trace、未脱敏日志、数据库
dump 或 backup。

发现的 24 个敏感键名位置已逐项处置：

- 18 个是 `.example` 中的明显 placeholder、空值、环境引用、本地服务地址或文档化开发默认值；
- 6 个是 `SESSION_COOKIE_NAME` / `SESSION_TTL_SECONDS`，属于配置名称和时长，不是 Cookie 或
  Session 内容；
- 高置信 Gitleaks finding 均为 0。

真实环境路径由精确 `.gitignore` 和 Docker context 规则保护；没有扩大 ignore 来隐藏本轮问题。

## 4. 补充规则候选处置

当前 tree 的补充扫描产生 21 个结构候选，但高置信 token/PEM/JWT/cloud credential 候选为 0：

| 类型 | 数量 | 处置 |
|---|---:|---|
| synthetic test fixtures | 10 | `FALSE_POSITIVE` |
| explicit example URLs | 3 | `FALSE_POSITIVE` |
| documented local command example | 1 | `FALSE_POSITIVE` |
| deploy security controls / boolean presence checks | 6 | `FALSE_POSITIVE` |
| local development DB fallback | 1 | `NOT_A_SECRET / SECURITY_HARDENING_RECOMMENDED` |

完整历史的 22 个唯一结构候选同样全部闭合：测试 fixture 8、example 4、本地 fallback 1、公开
Feishu OAuth endpoint 1、required env interpolation 1、文档本地命令 1、部署控制/布尔状态 6。
没有未研判候选。

### 非 Secret 的配置加固项

`apps/api/src/common/app-config.ts:81` 含本地开发数据库 URL fallback。它不是生产 credential，
也不需要 rotation；但 production/staging 配置没有像 Feishu credential 一样明确拒绝缺失或
已知 local/example/default 的 `DATABASE_URL` 与 `REDIS_URL`。

恢复 R27 修复后应：

- production/staging 必须显式提供两项连接配置；
- 拒绝已知 local/example/default credential；
- 增加缺失值、默认值和非法协议的 fail-closed 负向测试。

## 5. 图片、PDF、PPTX、视频和报告

| 范围 | 数量/结果 |
|---|---|
| tracked binary files | 283 |
| extracted binary strings | 2,914,361 bytes |
| tracked screenshots | 270 |
| tracked screenshot OCR observations | 10,316 |
| tracked PPTX | 3，43 slides |
| tracked PDF | 1，2 pages |
| UAT videos | 6，116 seconds，1 frame/second |
| rendered media images | 161 |
| all OCR images | 431 |
| all OCR observations | 15,369 |
| OCR failures | 0 |
| confirmed secret candidates | 0 |

第三个 tracked PPTX 的既有 OOXML shadow value 使标准 renderer 出现 `Int32` overflow；审计改用
LibreOffice headless 转 PDF，再用 Poppler 全量渲染 16 页，没有跳过文件。所有临时渲染、帧和
OCR 中间产物已从 `/tmp` 删除。

## 6. 非 Secret 仓库元数据告警

`git fsck --full --no-dangling` 发现共享 Git dir 中存在空的非法 ref 元数据：

```text
.git/refs/.DS_Store
```

它不包含 commit target，也不是源码或 credential。所有有效 refs 和 reflogs 均已扫描，finding
仍为 0。本 Gate 遵循只读边界，没有修改共享 `.git`；后续可在独立 Git 维护步骤精确删除该文件，
但不应把它计入漏洞或 Secret，也不需要 credential rotation。

## 7. 当前停止点

```text
CONFIRMED_SECRET_FINDINGS=0
UNCONFIRMED_SECRET_FINDINGS=0
SECRET_ROTATION_REQUIRED=NO
DATABASE_REDIS_CONFIG_HARDENING=OPEN_NON_SECRET_ITEM
GIT_METADATA_HYGIENE=OPEN_NON_SECRET_ITEM
REPOSITORY_SOURCE_UNCHANGED
PRODUCTION_UNCHANGED
GATE5_PASS
```

Gate 5 PASS 只证明密钥泄露目标为 0，不替代 Gate 3 SAST、Gate 4 dependency/image 或后续 DAST
门禁。
