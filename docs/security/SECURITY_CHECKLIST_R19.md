# R19 Security Checklist

> Round: `R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU`
> Stage: 范围确认与脚本准备
> Status values: `Not Started` / `Pass` / `Fail` / `N/A` / `Needs Owner Confirmation`
> Severity values: `Critical` / `High` / `Medium` / `Low` / `Info`

本清单用于公司私有云部署与飞书工作台上架前安全准入。当前阶段只建立检查基线；实际扫描、复测和漏洞闭环将在范围确认后执行。

## A. 主机与私有云安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| A-01 | 服务器是否安装主机安全软件或接入公司主机安全平台 | 主机安全平台截图或 agent 状态 | High | Not Started |
| A-02 | SSH 是否禁用密码登录 | `sshd -T` 输出 | High | Not Started |
| A-03 | 是否限制 root 直接登录 | `PermitRootLogin no` | High | Not Started |
| A-04 | 防火墙是否只开放必要端口 | 云防火墙、`ss -tlnp` | High | Not Started |
| A-05 | PostgreSQL 是否禁止公网访问 | 监听地址和防火墙规则 | Critical | Not Started |
| A-06 | Redis 是否禁止公网访问 | `bind`、`protected-mode`、防火墙规则 | Critical | Not Started |
| A-07 | systemd 服务是否以非 root 用户运行 | service `User=` | Medium | Not Started |
| A-08 | `.env.production` 权限是否为 600 或更严格 | `stat` 输出 | High | Not Started |
| A-09 | 日志文件是否不会暴露密钥 | 日志抽样审计记录 | High | Not Started |
| A-10 | Nginx 是否配置 HTTPS | TLS 证书和 Nginx 配置 | High | Not Started |
| A-11 | 是否启用 HSTS | 响应头 | Medium | Not Started |
| A-12 | 是否有备份和恢复方案 | 备份任务、恢复演练记录 | High | Not Started |
| A-13 | 是否有回滚方案 | 回滚脚本和演练记录 | Medium | Not Started |

## B. 静态代码安全扫描 SAST

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| B-01 | Semgrep OWASP Top 10 / JavaScript / TypeScript | `reports/security/sast/semgrep.json` | High | Not Started |
| B-02 | ESLint security baseline | `pnpm lint` 输出 | Medium | Not Started |
| B-03 | TypeScript 类型检查 | `pnpm typecheck` 输出 | Medium | Not Started |
| B-04 | 硬编码密钥检查 | Semgrep / gitleaks / 人工复核 | Critical | Not Started |
| B-05 | 危险函数检查：`eval` / `Function` / `innerHTML` | SAST 输出 | High | Not Started |
| B-06 | Node 危险调用：`child_process` / `exec` | SAST 输出 | High | Not Started |
| B-07 | SQL 注入风险：Prisma raw query / 字符串拼接 | SAST 输出 | Critical | Not Started |
| B-08 | XSS 风险：`dangerouslySetInnerHTML` / HTML 拼接 | SAST 输出 | High | Not Started |
| B-09 | SSRF 风险：服务端请求用户可控 URL | SAST 输出 | High | Not Started |
| B-10 | 文件路径拼接风险 | SAST 输出 | High | Not Started |
| B-11 | CORS wildcard 风险 | 配置检查 | High | Not Started |
| B-12 | Cookie secure / HttpOnly / SameSite | 代码和响应头检查 | High | Not Started |
| B-13 | JWT / session secret fallback | 配置检查 | High | Not Started |

## C. 依赖与供应链扫描 SCA

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| C-01 | `pnpm audit` | audit 输出 | High | Not Started |
| C-02 | `npm audit` / `audit-ci` 可选交叉检查 | audit 输出 | Medium | Not Started |
| C-03 | `osv-scanner` lockfile scan | OSV 报告 | High | Not Started |
| C-04 | Trivy filesystem scan | Trivy 报告 | High | Not Started |
| C-05 | Trivy image scan | Web/API 镜像报告 | High | Not Started |
| C-06 | Docker base image CVE | Dockerfile / image 报告 | High | Not Started |

## D. 密钥泄露扫描

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| D-01 | gitleaks 当前工作区扫描 | redacted JSON 报告 | Critical | Not Started |
| D-02 | git history secret scan | gitleaks history 报告 | Critical | Not Started |
| D-03 | `.env` 文件泄露检查 | 文件名和权限清单，不含明文值 | Critical | Not Started |
| D-04 | 飞书 App Secret 泄露检查 | 位置和风险类型，不含原文 | Critical | Not Started |
| D-05 | JWT / session secret 泄露检查 | 位置和风险类型，不含原文 | Critical | Not Started |
| D-06 | 数据库密码泄露检查 | 位置和风险类型，不含原文 | Critical | Not Started |
| D-07 | `.gitignore` 防环境文件入库 | `.gitignore` 规则 | High | Not Started |

## E. 动态应用安全测试 DAST

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| E-01 | OWASP ZAP baseline scan | HTML / JSON 报告 | High | Not Started |
| E-02 | 被动扫描 | ZAP 报告 | Medium | Not Started |
| E-03 | 认证后扫描 | 测试账号和 ZAP 报告，不含 token | High | Not Started |
| E-04 | API 扫描 | OpenAPI / API scan 报告 | High | Not Started |
| E-05 | 低风险主动扫描，仅限 staging | 授权记录和 ZAP 报告 | High | Not Started |
| E-06 | Security headers | 响应头报告 | Medium | Not Started |
| E-07 | reflected XSS / passive injection warning | ZAP 报告 | High | Not Started |
| E-08 | mixed content / directory listing / server leakage | ZAP 报告 | Medium | Not Started |
| E-09 | CSP / HSTS 缺失 | 响应头报告 | Medium | Not Started |
| E-10 | CORS 误配置 | 响应头和 API smoke | High | Not Started |

## F. 认证与会话安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| F-01 | 未登录访问是否返回 401 或跳转登录 | Playwright / API 测试 | High | Not Started |
| F-02 | Cookie 是否 HttpOnly | 响应头 | High | Not Started |
| F-03 | Cookie 是否 Secure | 响应头 | High | Not Started |
| F-04 | Cookie 是否 SameSite | 响应头 | Medium | Not Started |
| F-05 | Session 是否过期 | 单测 / 集成测试 | Medium | Not Started |
| F-06 | Logout 是否清理会话 | API 测试 | Medium | Not Started |
| F-07 | Feishu OAuth state 是否校验 | 代码审计 / 测试 | High | Not Started |
| F-08 | OAuth callback 是否限制 redirect URL | 代码审计 / 测试 | High | Not Started |
| F-09 | token 是否不会出现在 URL、日志和前端 localStorage | 代码审计 / 日志抽样 | Critical | Not Started |

## G. 权限与越权

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| G-01 | 普通用户不能访问他人项目 | API / E2E 测试 | Critical | Not Started |
| G-02 | 财务角色只能处理收费相关内容 | API / E2E 测试 | High | Not Started |
| G-03 | 质量角色才能处理评审 | API / E2E 测试 | High | Not Started |
| G-04 | 采购角色只能处理采购相关工序 | API / E2E 测试 | High | Not Started |
| G-05 | 未授权用户不能上传材料 | API / E2E 测试 | High | Not Started |
| G-06 | 未授权用户不能完成工序 | API / E2E 测试 | Critical | Not Started |
| G-07 | 未授权用户不能审批第 12 步 | API / E2E 测试 | Critical | Not Started |
| G-08 | 未授权用户不能篡改第 17 步月度评审 | API / E2E 测试 | Critical | Not Started |
| G-09 | 未授权用户不能修改第 18 步颜色退出结论 | API / E2E 测试 | Critical | Not Started |
| G-10 | `taskId` / `projectId` 枚举不能越权访问 | API / E2E 测试 | Critical | Not Started |

## H. 输入与输出安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| H-01 | XSS payload 展示为普通文本 | Playwright dialog 监听 | High | Not Started |
| H-02 | SQL 注入不返回 500 / 不泄露 SQL 错误 | API 测试 | Critical | Not Started |
| H-03 | Prisma 查询污染防护 | API 测试 | High | Not Started |
| H-04 | 路径穿越防护 | API / 上传测试 | High | Not Started |
| H-05 | 模板注入防护 | SAST / E2E | Medium | Not Started |
| H-06 | Open Redirect 防护 | API / OAuth 测试 | High | Not Started |
| H-07 | CORS 误配置防护 | `Origin` 测试 | High | Not Started |
| H-08 | CSRF 防护 | SameSite / Origin / CSRF 测试 | High | Not Started |
| H-09 | 参数篡改防护 | API 测试 | High | Not Started |

## I. 文件上传安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| I-01 | 扩展名白名单 | 单测 / API 测试 | High | Not Started |
| I-02 | MIME 类型校验 | 单测 / API 测试 | High | Not Started |
| I-03 | 文件魔数校验 | 单测 / API 测试 | High | Not Started |
| I-04 | 文件大小限制 | 单测 / API 测试 | Medium | Not Started |
| I-05 | 文件名重命名 | 代码审计 / API 测试 | Medium | Not Started |
| I-06 | 禁止路径穿越 | API 测试 | High | Not Started |
| I-07 | 禁止上传 `.php` / `.jsp` / `.html` / `.svg` / `.js` / `.exe` | API 测试 | High | Not Started |
| I-08 | 上传后文件不可被当作脚本执行 | 响应头 / 浏览器测试 | Critical | Not Started |
| I-09 | 附件访问必须鉴权 | API / E2E 测试 | Critical | Not Started |
| I-10 | 同项目/同工序权限隔离 | API / E2E 测试 | Critical | Not Started |
| I-11 | 版本记录与操作日志 | DB / API 验证 | Medium | Not Started |

## J. 网页防篡改

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| J-01 | 前端构建产物 hash 记录 | integrity manifest | Medium | Not Started |
| J-02 | 关键静态资源完整性校验 | 部署前后 hash diff | Medium | Not Started |
| J-03 | 部署前后文件差异记录 | integrity check 输出 | Medium | Not Started |
| J-04 | Nginx 静态目录只读 | 文件权限输出 | High | Not Started |
| J-05 | 非授权账号不能修改部署目录 | 用户/组/权限输出 | High | Not Started |
| J-06 | 检查是否存在陌生脚本、陌生 iframe、陌生外链 | 静态扫描输出 | Medium | Not Started |

## K. 业务逻辑安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| K-01 | 第 4 步完成后只能自动并行创建第 5 和第 6 步 | API / E2E 测试 | Critical | Not Started |
| K-02 | 第 6 步完成后只能自动并行创建第 7、第 9、第 10 步 | API / E2E 测试 | Critical | Not Started |
| K-03 | 第 9 步不允许阻塞主线 | API / E2E 测试 | High | Not Started |
| K-04 | 第 12 步不通过必须填写原因并退回第 11 步新轮次 | API / E2E 测试 | Critical | Not Started |
| K-05 | 第 13 步金额必须固定 10000 | API / E2E 测试 | Critical | Not Started |
| K-06 | 第 16 步完成后第 17 步必须生成 12 个月度实例 | API / E2E 测试 | Critical | Not Started |
| K-07 | 第 18 步年产量由人工录入，系统只给建议，不能自动最终决定 | API / E2E 测试 | High | Not Started |
| K-08 | 不允许跳过关键节点直接完成后续节点 | API / E2E 测试 | Critical | Not Started |
| K-09 | 不允许通过 API 伪造流程状态 | API 测试 | Critical | Not Started |

## L. 飞书工作台上架安全

| ID | Check | Expected Evidence | Severity | Status |
|---|---|---|---|---|
| L-01 | App ID / App Secret 未泄露 | secrets scan | Critical | Not Started |
| L-02 | redirect URL 配置为 HTTPS 固定域名 | 飞书后台截图 / 配置清单 | High | Not Started |
| L-03 | OAuth state 校验 | 代码审计 / API 测试 | High | Not Started |
| L-04 | 权限申请最小化 | 飞书权限清单 | Medium | Not Started |
| L-05 | 应用可用范围配置正确 | 飞书后台截图 | High | Not Started |
| L-06 | 通讯录范围配置正确 | 飞书后台截图 | High | Not Started |
| L-07 | 飞书登录失败时不会暴露错误详情 | API / UI 测试 | Medium | Not Started |
| L-08 | 飞书回调不会被 open redirect 利用 | API / UI 测试 | High | Not Started |
| L-09 | 上架说明、权限说明、测试账号准备完整 | 上架材料 | Info | Not Started |

## Current Pre-Scan Notes

- 现有 `AuthService` 设置会话 Cookie 为 `HttpOnly`、`SameSite=Lax`，生产或 HTTPS 前端下设置 `Secure`，但仍需通过真实响应头复验。
- 现有飞书 OAuth `state` 生成后未在服务端持久化并一次性校验，R19 全量阶段应优先复测并修复。
- 现有附件上传已限制 MIME 和大小，并生成对象存储 key；仍需补扩展名白名单、文件魔数校验和危险内容响应头复验。
- 生产 GCE 文档已记录 PostgreSQL / Redis 只监听本地，但公司私有云上线前必须以目标主机实际输出重新验证。
