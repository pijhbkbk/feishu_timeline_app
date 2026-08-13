# Security Invariants v2

这些不变量应逐步转化为测试、静态检查、数据库约束或启动时校验。Markdown 记录不是控制本身。

| ID | 不变量 | 首选强制方式 | 最低验证 |
|---|---|---|---|
| SEC-001 | 生产不得启用 mock login、测试 bypass 或默认管理员捷径 | 启动配置 schema + production hard fail | 配置负向测试 |
| SEC-002 | 所有业务写接口必须认证，public allowlist 不得豁免业务写 | 全局 auth guard + exact public registry | 路由清单与负向 API 测试 |
| SEC-002A | Public 例外仅限审计过的 auth bootstrap/callback、非敏感 health/readiness 或批准的只读元数据 | exact method+path registry、owner/review date | allowlist schema、未列路由 401/403 |
| SEC-003 | 所有对象级读写必须验证角色与项目/部门/资源范围 | Policy/Guard + Service 最终校验 | IDOR/跨项目负向测试 |
| SEC-004 | 流程、评审和终态写入校验当前状态与并发版本 | CAS/事务/锁/唯一约束 | stale-write 与重复写测试 |
| SEC-005 | OAuth state 一次性、短时、服务端验证 | Redis/持久化 nonce | replay/expiry 测试 |
| SEC-006 | Session/Cookie 符合生产安全属性，登出后服务端失效 | 统一 session service | Cookie/登出回归 |
| SEC-007 | Credentialed CORS 只允许明确 Origin | allowlist + 启动校验 | 非法 Origin 负向测试 |
| SEC-008 | 关键跨站写操作有批准的 CSRF/Origin 防护 | SameSite + Origin/CSRF | CSRF 负向测试 |
| SEC-009 | 输入和 legacy 数据在昂贵处理前有长度/数量/字节边界 | DTO + Service guard + DB constraint | 边界与超限测试 |
| SEC-010 | 列表、聚合和嵌套响应有界，禁止全量 materialize 后 slice | bounded query/sentinel/detail | 大数据量资源测试 |
| SEC-011 | 上传校验大小、扩展名、MIME、魔数和安全 key | 集中 FileAdmissionService | spoof/path traversal 测试 |
| SEC-012 | 未扫描或非 CLEAN 附件不得正常下载 | quarantine state machine + download guard | clean/EICAR/error/timeout 测试 |
| SEC-013 | 用户输入不得直接构造文件路径、shell、SQL、模板或外部 URL | 结构化 API、参数化、allowlist | 注入/SSRF/路径负向测试 |
| SEC-014 | Secret、Token、Cookie、密码和敏感 PII 不进入日志或客户端 | redaction + bundle scan | secrets/log/client scan |
| SEC-015 | 审计事实不可覆盖或静默删除 | append-only 语义 + 权限 | 写审计与删除负向测试 |
| SEC-016 | 通知、审计和附件增长有产品合同与安全终态，不盲删 | schema/retention ADR | migration + retention 测试 |
| SEC-017 | dependency、CI action、镜像和构建输入可追溯且固定 | lock/pin/digest/SBOM | SCA、manifest、digest |
| SEC-018 | dotenv 不由 shell source，plain SQL 不以 root 执行不可信内容 | parser + 最小权限 controller | shell security tests |
| SEC-019 | 目标源码树不能自举为 root trust root | 外部 root-owned controller + 批准 digest | trust-chain evidence |
| SEC-020 | 部署来自 clean、不可变、远端可解析 commit | release controller | commit/tree/runtime identity |
| SEC-021 | 安全 evidence 绑定 exact tree、工具、命令、环境和结果 hash | evidence manifest | manifest consistency |
| SEC-022 | 第三方 Agent 不接触未批准媒体、Secret 或生产数据 | 独立 no-hardlinks clone + allowlist | clone manifest/remote check |
| SEC-023 | Stage、commit、push、main merge、tag、staging/production access 和 deployment 独立授权 | Task Contract + preflight | authorization matrix check |
| SEC-024 | Critical/High 和高风险边界的 G4_DIFF 由独立任务或独立审查者执行 | review policy | reviewer identity + exact diff evidence |

## 实施原则

1. 高风险路径变更先识别受影响 invariant ID。
2. 目标测试直接证明 invariant，而不只证明页面可打开。
3. Service 最终防线不可仅靠 Controller DTO、前端或 Nginx 替代。
4. 数据库约束适合稳定、可迁移边界；无法安全迁移时记录 proof gap，不伪造已完成。
5. 局部 PASS 只适用于绑定的 exact tree 和覆盖路径。
6. Public 例外必须审计、精确、最小；业务写接口没有例外。
