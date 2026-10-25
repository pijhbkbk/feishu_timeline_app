# 原生本机 HTTPS 配置

不使用 Docker 网络的独立离线实例可显式设置
`LOCAL_RUNTIME_PROFILE=loopback-https`。此入口仅适用于
`NODE_ENV=production`、`DEPLOYMENT_ENV=staging`；它保留生产模式的认证、
Redis 故障拒绝服务、不可变构建身份匹配、存储配额和 ClamAV 要求。
正式公网 production 不接受此 profile。未设置时原有 staging/production 规则不变。

启动前必须满足：

- API 的 `HOST=127.0.0.1`，`PORT` 为显式 1024–65535 端口。
- `FRONTEND_URL=https://localhost:<端口>`，端口与 API 不同。TLS 代理和 Web
  也须实际仅监听 loopback；此配置校验本身不证明证书、代理或服务监听正确。
- DB、Redis URL 使用精确 `127.0.0.1` 和显式端口，密码至少 32 字符且非占位值；
  实例部署时独立随机生成，不能复制生产凭据。DB 使用专用应用用户与库名，
  查询参数只允许单个 `schema=public`；Redis 不允许查询参数或非空数据库路径。
- `AUTH_MOCK_ENABLED=false`，`MALWARE_SCANNER_PROVIDER=clamav`，
  `CLAMAV_HOST=127.0.0.1`。签名新鲜度和扫描边界仍执行原规则。
- `OBJECT_STORAGE_LOCAL_ROOT` 必须是显式、规范化的绝对目录，不能是文件系统根目录。
  实例须另行检查文件权限、持久化位置和对象集合，配置入口不执行迁移或复制。
- 原有 `EXPECTED_SOURCE_COMMIT`、`EXPECTED_SOURCE_TREE`、`EXPECTED_RELEASE`、
  `EXPECTED_BUILD_TIME`、配额等受保护环境必填值仍必填。

环境参数通过受限配置文件/进程环境传入，不使用 shell `source`，不记录凭据。
新恢复实例在启动前单独核对通知队列、定时任务和 quota reconciliation 的数据影响；
本 profile 不停用这些服务。数据库、Redis、扫描器的监听与持久化设置、TLS 信任、
实际登录、媒体、新写及应用重启后的读回分别验证，不能由配置校验代替。
