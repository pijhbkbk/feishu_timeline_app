# R19 Threat Model

> Round: `R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU`
> Stage: 范围确认与脚本准备
> Method: Asset / Actor / Threat / Control baseline aligned to OWASP ASVS, WSTG and OWASP Top 10 themes

## 1. Assets

| Asset | Security Need | Notes |
|---|---|---|
| 项目数据 | Confidentiality, integrity, auditability | 包括项目编号、颜色名称、客户需求、计划周期。 |
| 工序状态 | Integrity, non-repudiation | 第 4、6、9、12、13、16、17、18 步为重点。 |
| 用户身份 | Confidentiality, integrity | 飞书身份、系统用户、会话。 |
| 角色权限 | Integrity | 决定项目可见性、工序处理、评审、收费、颜色退出。 |
| 附件材料 | Confidentiality, integrity, malware resistance | 材料文件、评审附件、收费凭证。 |
| 收费凭证 | Confidentiality, integrity | 第 13 步固定 10000 元，凭证不可被越权替换。 |
| 评审报告 | Integrity, auditability | 第 12 步和第 17 步是门禁节点。 |
| 颜色退出数据 | Integrity | 第 18 步最终结论必须人工确认。 |
| 飞书 OAuth 凭证 | Confidentiality | App Secret、授权码、user access token。 |
| 数据库连接信息 | Confidentiality | `DATABASE_URL`、账号、密码、备份文件。 |
| Redis 会话数据 | Confidentiality, integrity | session token 与队列状态。 |
| 前端构建产物 | Integrity | 需要防篡改 hash 与部署目录权限。 |
| 审计日志 | Integrity, retention | 不允许删除或覆盖。 |

## 2. Attackers

| Attacker | Capability | Primary Risk |
|---|---|---|
| 未登录外部用户 | 访问公网入口、构造 API 请求 | 未授权访问、信息泄露、登录链路滥用。 |
| 普通内部用户 | 有合法会话、有限角色 | IDOR、越权访问他人项目、枚举附件。 |
| 越权部门用户 | 属于其他部门或其他项目 | 跨项目读取、工序篡改、附件下载。 |
| 被盗账号用户 | 拥有真实用户会话 | 越权业务操作、审计追踪不足。 |
| 有上传权限但恶意上传的用户 | 能上传附件 | 恶意文件、XSS、脚本执行、存储污染。 |
| 有服务器低权限账号的攻击者 | 可读部分系统文件或部署目录 | 密钥读取、构建产物篡改、横向移动。 |
| 供应链攻击者 | 影响依赖包或镜像 | 依赖 CVE、构建时植入。 |

## 3. Trust Boundaries

| Boundary | Data Crossing | Security Requirement |
|---|---|---|
| Browser / Next.js | 页面、表单、Cookie、附件选择 | 所有业务裁决必须交给后端；前端不得拼流程状态。 |
| Next.js / NestJS API | JSON API、multipart 上传、session cookie | 后端认证、权限、状态校验、输入校验。 |
| NestJS / PostgreSQL | Prisma 查询、事务、审计日志 | 禁止 raw SQL 注入；关键写操作幂等。 |
| NestJS / Redis | session、队列、缓存 | Redis 不公网暴露；session 过期和 logout 清理。 |
| NestJS / Object Storage | 附件二进制 | 只保存对象存储 key 和元数据；禁止脚本执行。 |
| System / Feishu Open Platform | OAuth code、token、用户信息 | 固定 HTTPS redirect、state 一次性校验、最小权限。 |
| Deployment / Nginx | TLS、反向代理、静态资源 | HTTPS、HSTS、安全头、防目录浏览、构建完整性。 |

## 4. Key Threats

| ID | Threat | Scenario | Severity | Baseline Control |
|---|---|---|---|---|
| T-01 | 未授权访问项目 | 未登录用户访问 `/api/projects` 或项目详情 | Critical | Session guard、401/403、E2E 未登录测试。 |
| T-02 | IDOR 越权读取工序详情 | 修改 `taskId` 读取他人项目工序抽屉 | Critical | 后端按 task 所属 project 做项目权限校验。 |
| T-03 | 越权完成工序 | 非负责人或无角色用户直接 POST complete | Critical | Service 层角色、负责人、当前状态校验。 |
| T-04 | 篡改第 12 步评审结果 | 普通用户直接提交通过/驳回 | Critical | 质量/评审角色校验、状态机校验、审计日志。 |
| T-05 | 篡改第 13 步收费金额 | API 传入 `1`、`-100`、`999999` | Critical | 服务端固定金额 `10000`，拒绝客户端金额。 |
| T-06 | 篡改第 17 步月度评审 | 非质量角色修改月份结果 | Critical | 月度实例权限、状态、审计日志。 |
| T-07 | 篡改第 18 步颜色退出结论 | 普通用户修改最终结论 | High | 管理角色校验，系统只给建议。 |
| T-08 | 上传恶意文件 | 上传 `.svg` / `.html` / 伪装 `.jpg` 的脚本 | Critical | 扩展名、MIME、魔数、大小、下载响应头、隔离存储。 |
| T-09 | XSS 窃取会话 | 项目名、评审意见、附件名注入脚本 | High | 输出编码、禁止危险 HTML、Playwright dialog 测试。 |
| T-10 | 密钥泄露 | App Secret、DB 密码进入 git 或日志 | Critical | gitleaks、redacted 报告、环境文件 gitignore、轮换。 |
| T-11 | OAuth redirect 被劫持 | callback/redirect 参数跳到恶意域名 | High | 固定 redirect URI、state 一次性校验、站内跳转白名单。 |
| T-12 | 生产静态文件被篡改 | 非授权用户修改 `.next/static` | High | hash 清单、只读目录、部署用户最小权限。 |
| T-13 | 数据库端口暴露 | PostgreSQL 监听公网 | Critical | 防火墙、本地监听、pg_hba 最小化。 |
| T-14 | Redis 端口暴露 | Redis 公网访问导致 session 泄露 | Critical | `bind 127.0.0.1`、protected mode、防火墙。 |
| T-15 | CSRF 完成关键动作 | 第 12/13/18 步被跨站 POST | High | SameSite、Origin 检查或 CSRF token。 |
| T-16 | CORS 携带凭证误配置 | 任意 Origin 访问 API | High | 固定 `FRONTEND_URL`，禁止 wildcard credentials。 |
| T-17 | 依赖高危漏洞 | Next/Nest/Prisma/镜像 CVE 可利用 | High | SCA、升级或风险接受。 |
| T-18 | 审计日志缺失或被覆盖 | 关键写操作不可追责 | High | 审计日志落库、禁止删除覆盖、复测。 |

## 5. Risk Rating

| Severity | Definition | R19 Gate |
|---|---|---|
| Critical | 可导致未授权访问核心数据、任意状态篡改、密钥泄露、DB/Redis 公网暴露、恶意文件执行 | 必须修复并复测通过后才能建议上线。 |
| High | 可导致重要越权、XSS、CSRF 关键动作、CORS 凭证滥用、高危依赖漏洞 | 必须修复，或由业务和信息安全书面风险接受。 |
| Medium | 增加攻击面或削弱防御深度，如 CSP 不完整、安全头缺失、文件类型校验不够严格 | 上线前尽量修复；否则记录计划和 owner。 |
| Low | 低影响配置、文案、弱提示或难以利用问题 | 可延期，但必须登记。 |
| Info | 观察项、证据项、最佳实践建议 | 记录即可。 |

## 6. Security Goals

- 未授权用户无法访问业务数据。
- 角色权限不可绕过。
- 文件上传不可执行。
- 密钥不出现在代码和日志中。
- 生产主机只开放必要端口。
- PostgreSQL 和 Redis 不公网暴露。
- 飞书登录链路安全，OAuth `state` 必须校验且一次性使用。
- 前端静态资源和部署目录具备完整性校验与最小写权限。
- 所有 Critical / High 问题必须修复或按规则完成风险接受。

## 7. Current Pre-Scan Hypotheses

这些是范围准备阶段基于代码快速阅读形成的复测假设，不是最终漏洞结论：

| Hypothesis | Risk | Required R19 Action |
|---|---|---|
| 飞书 OAuth `state` 当前传入 adapter 后未校验服务端存储值 | High | 增加或验证一次性 state 存储、过期和 callback 校验测试。 |
| 附件校验当前主要依赖 MIME 和大小 | High | 增加扩展名白名单、魔数校验和危险文件测试。 |
| 生产 Cookie 安全属性依赖 `NODE_ENV` / HTTPS URL | Medium | 通过真实响应头检查生产和私有云环境。 |
| 当前 GCE 文档记录 DB/Redis 本地监听 | Critical if drifted | 目标服务器必须重新跑 `host-security-check.sh`。 |
| CORS 依赖单一 `FRONTEND_URL` | High if wildcard or mismatch | 检查生产/私有云配置，非法 Origin 不得携带凭证访问。 |
