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

2026-07-14 访问策略调整后，认证耐久不再要求九种角色会话；一个受控的有效飞书测试会话即可覆盖全权限业务路径。当前 BLOCKED 原因仍是没有安全注入会话的方式，不是角色数量不足。

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

## 5. R23B 最终候选说明（2026-07-15）

最终 `applicationCommit`/`stagingCommit` 为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`。部署后 17 个 migration、五个服务、HTTP 与静态资源检查全部通过，API/Web 近 10 分钟日志未检出 error、exception、fatal 或 panic。

现有可量化性能数据仍来自较早候选的 20 VU × 5m 未认证只读档：

| 指标 | 值 |
|---|---:|
| p50 / p95 / p99 | `7.04 / 46.17 / 74.91 ms` |
| error rate / 5xx | `0% / 0` |
| 空闲回收后 API+Web 内存增长 | `4.87%` |
| DB max connections / slow queries / deadlocks | `4 / 0 / 0` |
| Redis max memory | `1,423,032 bytes` |
| service restarts | `0` |

`5 VU × 2h` 与 `10 VU × 30m` 的最终提交认证数据均为 `NOT RUN / BLOCKED`。原因是没有不暴露 Cookie/token/storageState 的安全会话注入路径；本轮没有读取、导出或持久化真实浏览器会话机密。短时只读数字仅供基线参考，不能作为最终候选认证耐久 PASS 证据。

## 6. R23C 认证耐久进展（2026-07-16）

真实飞书 OAuth 会话已通过受控临时目录安全注入；不包含认证值的最终状态为 `authSessionUsed: true`、`authMaterialDestroyed: true`。

| Profile | 结果 | p50 / p95 / p99 | error / 5xx / auth |
|---|---|---|---|
| 5 VU × 2 h | PASS | read `23.436 / 736.946 / 2116.852 ms`; write `27.012 / 133.294 / 373.641 ms` | `0 / 0 / 0` |
| 10 VU × 30 m（修复前） | FAIL | read `37.581 / 1104.928 / 4243.791 ms`; write `47.103 / 403.541 / 674.133 ms` | `0.0474% / 0 / 0` |
| 10 VU × 30 m（修复后） | BLOCKED / NOT RUN | — | 外部 registry 连续两次阻断部署 |

5 VU 共 32,539 请求，0 失败；API/Web 空闲回收后内存增长 -59.6311%；DB max connections 18、slow query 0、deadlock 0；Redis max memory 1,456,784 bytes、queue 0；五服务 restart 0。峰值 CPU（API/Web/Nginx/PostgreSQL/Redis）为 `332.26/9.29/3.14/26.26/2.61%`，峰值内存约 `1103.87/120.90/14.49/173.20/10.41 MiB`。

修复前 10 VU 共 14,767 请求，7 次失败均为项目日志读取10秒超时。项目累计23,179条审计记录时，旧接口仍忽略 `pageSize=20` 并返回约11.1 MB。候选 `a4a9efd50404a512102dd74d1ab18d9bceb971a9` 已实施有界分页，但未能部署；因此 R23 性能门禁保持 BLOCKED，不能用本地测试或修复前数据宣称 PASS。

详见 `docs/testing/R23C_BLOCKER_REPORT.md` 与 `test-results/r23c/`（Git ignored）。
