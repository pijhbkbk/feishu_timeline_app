# R19 Security Scope

> Round: `R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU`
> Stage: 范围确认与脚本准备
> Status: Draft for owner confirmation
> Date: 2026-05-19

本文件只定义上线前安全测试范围，不代表已经授权执行主动扫描。主动 DAST、渗透测试和认证后扫描必须在 staging 或本地测试环境执行；生产环境只允许被动检查、配置检查、健康检查、权限验证和有限 smoke security test。

## 1. 系统名称

轻卡定制颜色开发项目管理系统

## 2. 业务模块范围

- 系统导览
- 工作台
- 项目看板
- 项目列表
- 项目详情
- 工序详情抽屉
- 材料中心
- 月度评审
- 数据中心
- 系统设置
- 飞书登录 / 飞书工作台入口

## 3. 后端接口范围

- `/api/auth/*`
- `/api/projects/*`
- `/api/workflows/*`
- `/api/dashboard/*`
- `/api/materials` 或 `/api/attachments`
- `/api/monthly-reviews/*`
- `/api/analytics/*`
- `/api/color-exit/*`
- `/api/health`

当前代码中还存在与主链路相关的专项接口，R19 全量扫描阶段应纳入同等权限和输入验证口径：

- `/api/tasks/*`
- `/api/reviews/*`
- `/api/fees/*`
- `/api/color-exits/*`
- `/api/mass-productions/*`
- `/api/performance-tests/*`
- `/api/paint-procurements/*`
- `/api/production-plans/*`
- `/api/standard-boards/*`
- `/api/samples/*`
- `/api/development-reports/*`
- `/api/activity-logs/*`

## 4. 数据范围

- 项目数据
- 工序数据
- 负责人 / 部门
- 附件材料
- 评审记录
- 颜色开发收费凭证
- 年产量与颜色退出记录
- 操作日志

## 5. 环境范围

| Environment | Purpose | Active Test Allowed | Notes |
|---|---|---:|---|
| `local` | 本地开发和安全测试 | Yes | 默认优先目标，允许自动化写入测试数据。 |
| `staging` | 预发布验证 | Yes, with approval | 允许低风险主动扫描、认证后扫描和业务逻辑安全测试。 |
| 当前 VPS 生产环境 | 线上只读与有限 smoke | No | 只允许被动检查、健康检查、配置检查和已授权账号的有限权限验证。 |
| 未来公司私有云环境 | 上线前准入 | By approval | 主机安全、网络访问控制、飞书工作台配置和部署完整性必须复验。 |

## 6. 禁止范围

- 不扫描飞书开放平台自身域名。
- 不扫描公司未授权 IP。
- 不做拒绝服务测试。
- 不做破坏性数据删除。
- 不爆破真实用户账号。
- 不上传真实恶意样本，只允许使用安全测试样本。
- 不输出真实密钥、token、cookie、数据库密码、飞书 App Secret。
- 不把测试账号密码写入仓库文档；如需提供，必须通过公司密码管理器或单独安全渠道。

## 7. 扫描授权规则

- `local` 默认授权本机回环地址：`http://localhost:3000`、`http://127.0.0.1:3000`、`http://localhost:3001`。
- `staging` 需要由项目负责人确认域名、测试账号和测试窗口。
- 生产域名 `https://timeline.all-too-well.com` 只允许 baseline/passive/smoke 级检查，不允许主动攻击类扫描。
- 公司私有云 IP、服务器 IP 和飞书工作台测试账号需要在 `SECURITY_ACCEPTANCE_R19.md` 中登记，但不得登记密码明文。

## 8. 预期交付物

本阶段交付：

- `docs/security/SECURITY_SCOPE_R19.md`
- `docs/security/SECURITY_CHECKLIST_R19.md`
- `docs/security/THREAT_MODEL_R19.md`
- `scripts/security/*`

全量安全检查阶段再生成：

- `docs/security/SAST_REPORT_R19.md`
- `docs/security/SCA_REPORT_R19.md`
- `docs/security/SECRETS_SCAN_R19.md`
- `docs/security/DAST_ZAP_REPORT_R19.md`
- `docs/security/PERMISSION_TEST_REPORT_R19.md`
- `docs/security/FILE_UPLOAD_SECURITY_R19.md`
- `docs/security/BUSINESS_LOGIC_SECURITY_R19.md`
- `docs/security/INPUT_SECURITY_R19.md`
- `docs/security/FEISHU_WORKBENCH_SECURITY_R19.md`
- `docs/security/PRIVATE_CLOUD_SECURITY_R19.md`
- `docs/security/WEB_TAMPER_PROTECTION_R19.md`
- `docs/security/SECURITY_HEADERS_R19.md`
- `docs/security/REMEDIATION_TRACKER_R19.md`
- `docs/security/SECURITY_ACCEPTANCE_R19.md`
