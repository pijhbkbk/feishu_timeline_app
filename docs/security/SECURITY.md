# SECURITY.md

## 1. 用途与规范来源

本文件提供仓库级安全上下文：资产、信任边界、public 例外、finding 标准、严重度和扫描边界。

唯一安全状态源：

```text
Finding Ledger: docs/security/FINDINGS.yaml
Ledger Schema: docs/security/FINDINGS.schema.yaml
Security Invariants: docs/security/SECURITY_INVARIANTS.md
```

其他扫描报告、tracker、round 文档和 handoff 只能引用或向 Ledger 导入证据，不得建立第二套 finding 状态。

## 2. 关键资产

- 飞书 OAuth 身份、session、Cookie、state、token/ticket 缓存；
- 项目、流程、评审、附件、收费、排产、批产、月度评审和颜色退出数据；
- 角色、部门、项目成员、管理员与对象级数据范围；
- 附件对象存储、quarantine/scan 状态和下载授权；
- 审计日志、历史版本、通知和业务幂等记录；
- PostgreSQL、Redis、对象存储、镜像、CI/CD、部署 controller 与目标主机；
- Secret、环境配置、构建/运行 commit 与证据 manifest。

## 3. 主要信任边界

```text
Browser / Feishu H5
        ↓
Next.js Web
        ↓
NestJS API authentication + authorization
        ↓
Domain Services / Prisma
        ↓
PostgreSQL / Redis / Object Storage / Scanner
        ↓
CI/CD / Nginx / systemd / private-cloud runtime
```

还包括：

- 飞书开放平台与本系统之间的 OAuth/JSAPI 边界；
- 用户上传内容与受信任运行时之间的文件边界；
- 应用用户与管理员、项目与项目、部门与部门之间的数据范围边界；
- Git source tree、构建产物、部署 controller 和 root 权限之间的供应链边界；
- OpenAI Codex、其他第三方 Agent 与本地敏感数据之间的数据外发边界。

## 4. Public endpoint 例外

- 默认所有 API 受认证保护；所有业务写接口必须认证，绝无 public allowlist 例外。
- Public allowlist 只允许以下经审计类别：
  1. OAuth/飞书认证 bootstrap；
  2. OAuth/飞书 callback；
  3. 返回非敏感信息的 health/readiness；
  4. 产品负责人和安全负责人明确批准的只读公共元数据。
- 每项 public 例外必须精确记录：HTTP method、route、业务目的、允许输入、允许输出、rate/resource bound、责任人、批准依据、复核日期和负向测试。
- 禁止使用宽泛前缀、Controller 级整组豁免、环境变量隐式放开或“内部接口”作为 public 依据。
- public callback 只能完成认证交换，不得直接执行一般业务写入或绕过后续授权。

## 5. 必须报告的 Finding

在有可验证代码路径、配置路径或可信证据时，至少报告：

- 未认证、角色绕过、对象级越权、项目/部门范围泄漏；
- OAuth state、session fixation、Cookie、CSRF、CORS、open redirect 和登出失效；
- SQL/命令/模板注入、SSRF、路径穿越、任意文件读写或上传后执行；
- 上传 MIME/魔数/扩展名绕过、quarantine/scan 绕过和未授权下载；
- Secret、Token、Cookie、数据库连接串或敏感 PII 泄漏；
- 无界输入、分页、聚合、嵌套响应、任务队列、附件、通知或审计增长导致的可达资源耗尽；
- 并发 stale-write、重复提交、状态机绕过、终态重写、幂等失败；
- fail-open 生产配置、mock auth、危险默认值或环境变量解析执行；
- 依赖、镜像、CI action、部署脚本、root trust、签名/摘要和不可信构建链；
- 可破坏审计、历史、附件留存或业务追溯性的“安全修复”。

## 6. Finding 不应仅凭以下内容成立

- 仅有危险函数名称但没有可达用户输入或信任边界；
- 仅有最佳实践差异但没有实际安全影响；
- 仅根据测试夹具、文档示例或不可执行 dead code；
- 已有统一控制在所有可达路径上可靠阻断；
- 需要未授权生产主动攻击、真实恶意样本或公司基础设施访问才能验证且尚未授权；
- 扫描工具失败或未产出报告。

不确定项标为 `candidate` 或 proof gap，不得伪装成 confirmed，也不得静默删除。

## 7. 严重度

- **Critical**：核心数据重大未授权访问/修改、任意代码或 root 执行、Secret 泄漏、恶意文件执行、数据库/Redis 公网暴露、跨租户重大破坏。
- **High**：重要 IDOR/权限绕过、关键 CSRF/CORS 滥用、可利用注入、上传/下载边界突破、严重资源耗尽、高危供应链或生产 fail-open。
- **Medium**：攻击面或防御深度明显削弱，利用需要额外条件；包括部分 CSP、安全头、有限资源边界或不完整审计。
- **Low**：影响有限、难以利用、主要为加固质量问题。
- **Info**：观察、证据缺口和建议，不计入已确认漏洞总数。

## 8. Finding 生命周期与证据

状态只能使用：

```text
candidate
confirmed
duplicate
false_positive
accepted_for_fix
in_progress
fixed_target_verified
fixed_diff_verified
fixed_full_verified
risk_accepted
closed
```

- 允许转换由 `FINDINGS.schema.yaml` 的 history transition enum 和本文件约束共同定义。
- 每项 finding 必须绑定 exact source evidence：commit、tree、tool name/version、command、environment、result SHA-256 和记录时间。
- targeted、diff、full 验证各自绑定独立 evidence；不同 tree 的 PASS 不得混用。
- `risk_accepted` 必须有批准人、风险责任人、依据、批准时间、到期时间、复核时间和补救计划；到期后必须重新打开或重新批准。
- `closed` 只能在达到声明的 closure criterion 且 evidence 已绑定时使用。

## 9. 扫描与修复边界

- `G4_DIFF`：exact patch/commit/branch，只读；默认独立任务或审查者。
- `G4_COMPONENT`：明确目录/组件，只读；需要固定 scope、授权和预算。
- `G4_FULL`：clean immutable commit，全仓只读；需要 full-scan 高成本批准和预算上限。
- Security scan、triage、patch、independent verification、full regression 和 release 分清证据职责；获准完整修复可在同一主任务内闭环，独立验证须由另一只读上下文完成。
- 纯扫描任务不自动修复；所有者已授权实施的同根因修复无需另开会话，远端与 release 仍需具体权限。
- 局部 PASS 不得表述为全源 0C/0H/0M 或 security clearance。

## 10. 默认排除与授权

默认不允许：

- 对 production 主动 DAST、爆破、DoS、破坏性数据删除或真实恶意样本上传；
- 读取未跟踪用户媒体、个人附件、Secret、生产数据库和未经批准第三方目录；
- 把源码、日志、证据或用户文件发送给未经批准第三方模型；
- 未经产品负责人和公司安全授权变更生产、主机、网络、证书、registry、IAM 或数据保留策略。

## 11. 目录级扩展

高风险目录可增加更具体的嵌套 `SECURITY.md`：

- `apps/api/src/modules/auth/SECURITY.md`
- `apps/api/src/modules/attachments/SECURITY.md`
- `apps/api/src/modules/projects/SECURITY.md`
- `scripts/deploy/SECURITY.md`
- `apps/api/prisma/SECURITY.md`

这些文件只补充本目录信任边界、允许模式、禁止模式和验证命令，不重复仓库政策。
