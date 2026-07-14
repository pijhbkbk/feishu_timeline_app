# R23 性能与耐久报告

## 1. 工具

新增 `scripts/testing/r23-load.mjs`，只使用 Node 标准库，支持：

- VU、持续时间、think time 和目标 URL 参数化；
- p50/p95/p99、error rate、5xx；
- API/Web/Nginx/PostgreSQL/Redis CPU 与内存采样；
- DB connection、慢查询、deadlock；
- Redis memory、容器 restart；
- Nginx 5xx、uncaught exception、unhandled rejection 日志计数；
- 可选 `R23_STAGING_SESSION_COOKIE` 环境注入，值不会进入结果或日志。

## 2. 脚本冒烟

| 项目 | 结果 |
|---|---:|
| 配置 | `2 VU × 10s`，500ms think time |
| 请求 | 10 |
| transport error / unexpected status / 5xx | `0 / 0 / 0` |
| 整体 p50 / p95 | `14.19 ms / 2014.01 ms`（首次页面冷启动包含在内） |
| API+Web 内存增长 | `1.17%` |
| DB connection / slow query / deadlock | `4 / 0 / 0` |
| 容器重启 | `0` |

证据：`test-results/r23/performance/script-smoke-*.json`。

## 3. 正式耐久矩阵

| Profile | 认证范围 | 状态 |
|---|---|---|
| 5 VU × 2h | 真实认证业务路径 | BLOCKED：缺少可安全注入的真实测试会话 |
| 10 VU × 30m | 真实认证业务路径 | BLOCKED：同上 |
| 20 VU × 5m | 只读与未认证边界 | PASS |

### 20 VU × 5m 最终候选结果

被测应用 commit：`69d3332f30d6a7354c9b252d911cfe0a2652f76e`。

| 指标 | 结果 |
|---|---:|
| 请求 / 吞吐 | `5600 / 18.64 req/s` |
| transport error / unexpected status / 5xx | `0 / 0 / 0` |
| p50 / p95 / p99 / max | `7.04 / 46.17 / 74.91 / 181.73 ms` |
| 查询 API p95 | `7.32 ms` |
| Web 页面响应 p95 | `55.85 ms` |
| DB max connection / slow query / deadlock | `4 / 0 / 0` |
| Redis max memory | `1,423,032 bytes` |
| 容器重启 | `0` |
| uncaught / unhandled rejection / Nginx 5xx | `0 / 0 / 0` |

窗口结束时 Web RSS 为 259.4 MiB（基线 113.9 MiB），API+Web 瞬时增长 82.73%；停止负载并空闲回收后，2026-07-14 17:11:34 CST 复核 Web 为 115.6 MiB、API 为 77.66 MiB，合计较负载前基线增长 4.87%。该结果未呈现持续泄漏，但 5 分钟只读档不能替代 2 小时认证耐久门禁。

证据：`test-results/r23/performance/20vu-5m-final-candidate-2026-07-14T09-05-00-621Z.json`、`test-results/r23/performance/20vu-5m-final-candidate-post-idle.md`。

未完成 2 小时耐久前，不给出 R23 性能 PASS，也不以短时冒烟替代耐久结论。

## 4. 执行命令

```bash
pnpm test:load:r23 -- --base-url http://localhost:8080 --vus 5 --duration 2h --profile endurance-5vu
pnpm test:load:r23 -- --base-url http://localhost:8080 --vus 10 --duration 30m --profile load-10vu
pnpm test:load:r23 -- --base-url http://localhost:8080 --vus 20 --duration 5m --profile readonly-20vu
```
