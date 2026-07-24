# R26 Gate 3D 完整生命周期 Staging UAT 报告

## 结论

R26 Gate 3D 已在独立 staging 完成从新建项目历史到退出治理的完整主链路 UAT。
本报告只代表技术实现和真实操作完成，不替代产品负责人人工验收。

```text
R26_GATE3D_STAGING_UAT_COMPLETED
FULL_MAINLINE_FROM_PROJECT_CREATION_TO_EXIT_VERIFIED
AUDIT_AND_DATABASE_EVIDENCE_COMPLETE
PRODUCTION_UNCHANGED
AWAITING_PRODUCT_OWNER_FULL_LIFECYCLE_CONFIRMATION
```

## 环境

| 项目 | 值 |
| --- | --- |
| staging | `http://localhost:8080` |
| 分支 | `codex/r26-gate3c2-c3-d-full-lifecycle` |
| 真实用户 | 李晓晨 |
| UAT 项目 | `R26-G3C1-UAT-普通推进-20260724-2301` |
| 项目编号 | `G3C1-SERIAL-20260724-2301` |
| production 请求 | `0` |
| seed | 未运行 |

该项目从真实立项开始，Gate 3C1 已保留第 1～11 步的串行、并行和非阻塞历史；本轮在
同一个项目上继续完成第 12～18 步，因此数据库、流程转移和审计日志形成单一连续证据链。

## 完整结果

- 项目：`COMPLETED`；
- 当前节点：`PROJECT_CLOSED`；
- 地图：`18 / 18`；
- 第 12 步：第一轮驳回、第 11 步重新试制、第二轮通过；
- 第 13 步：10000 元收费已支付并完成；
- 第 14～16 步：评审、排产、批量生产完成；
- 第 17 步：12/12 独立月度评审全部通过；
- 第 18 步：系统建议退出，授权人员人工决定退出，项目收尾。

冻结拓扑仍保留第 5、7、9 步非主线活动任务；这些支线不阻塞主线和退出治理，没有被
前端伪造为完成。所有主链路推进均来自服务端状态机。

## 质量门禁

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 36 files / 124 tests；API 62 files / 283 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

两次 staging PostgreSQL 备份均已验证目录可读取：

- 前置备份：`42ac88e34873473a64dfc822d905f5107d8f28a9ec08b0bcbde4f67d9be2c36d`
- UAT 后备份：`216a56cd884fba138466584f43b2ce7351de7f2ce98da86f6e22872b6b51d9e6`

## 等待人工验收

产品负责人应从 `/v2/projects` 进入完成项目，重点复核：

1. 第 12 步两轮历史和退回原因；
2. 第 13 步固定收费、支付与非阻塞语义；
3. 第 14～16 步记录和状态；
4. 第 17 步 12/12 与独立月份；
5. 第 18 步系统建议与人工决定的明确区分；
6. 项目记录、流程地图和项目列表完成状态一致；
7. 1440、1024、390 三档真实页面。

未进行 production 部署、`main` 合并或稳定 tag。

