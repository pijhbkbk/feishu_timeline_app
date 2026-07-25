# R26P 部署前安全差异

## 当前公网候选版本快检

扫描对象为第一方源码、锁文件和精确候选镜像，排除了 `node_modules`、`.next`、
`dist`、`coverage`、测试结果、报告、备份和认证材料。

| 项目 | 结果 |
| --- | --- |
| Semgrep 第一方源码 | 469 个候选文件，0 finding，0 error |
| Gitleaks 当前工作树 | 0 finding |
| Gitleaks Git 历史 | 0 finding |
| pnpm audit 全依赖 | Critical 0 / High 0 |
| pnpm audit production | Critical 0 / High 0 |
| Trivy filesystem | vulnerability 0 / secret 0 |
| API image | vulnerability 0 |
| Web image | vulnerability 0 |
| PostgreSQL image | vulnerability 0 |
| Redis image | vulnerability 0 |
| Nginx image | vulnerability 0 |

API 和 Web SBOM 使用 CycloneDX 1.7 生成，分别包含 426 和 425 个组件。

## 已知差异

- Trivy 有一项 LOW Dockerfile healthcheck 配置提示；运行编排已有 healthcheck，
  不属于发布阻断级别。
- 历史公司前端 SAST 报告登记 156 条未处置混合范围告警，其中包含
  `node_modules` 和 `.next`。它们既不能被当作 156 个第一方漏洞，也不能在缺少
  逐项研判时批量标记误报。
- 本轮安全快检只允许当前公网候选版本进入产品发布门禁，不构成公司私有云信息安全
  正式准入。

## R27 必做

1. 生成只含第一方源码的干净扫描包；
2. 第一方 SAST、依赖 SCA 和镜像扫描分开出具报告；
3. 对历史 156 条逐项映射、修复或记录可验证误报依据；
4. 确认公司私有云附件病毒查杀要求（ClamAV、ICAP 或公司文件安全网关）；
5. 未研判告警清零后再申请公司私有云准入。
