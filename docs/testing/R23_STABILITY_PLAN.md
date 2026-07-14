# R23 真实使用稳定性测试计划

## 1. 目标与边界

R23 在 `release/r22-stability-security-rc` 上验证当前 R22/R23 代码的真实业务可用性、并发一致性、异常恢复和耐久性。结论不得引用旧 R19/R20/R22 的历史执行结果；旧用例只能在当前代码上重新运行。

本轮允许修改候选分支、独立 staging 和本地测试数据；禁止合并 `main`、打 tag、部署生产或主动扫描生产。

## 2. 环境与隔离

| 项目 | 配置 |
|---|---|
| 候选分支 | `release/r22-stability-security-rc` |
| staging URL | `http://localhost:8080` |
| staging Compose | `feishu-timeline-staging` |
| PostgreSQL | 独立容器/卷，端口 `15432`，数据库 `feishu_timeline` |
| Redis | 独立容器/卷，端口 `16379` |
| 对象存储 | staging 独立 Docker volume |
| Session | staging 独立 secret，环境文件权限 `0600` |
| 飞书 | 预发布/测试应用，mock 登录关闭 |
| local 自动化 | `localhost:3000/3001`，独立本地 PostgreSQL/Redis，允许 mock 角色 |

staging、local 与 production 不共享数据库、Redis 或附件目录。账号密码、Session Cookie、飞书 secret 不写入仓库、报告或测试证据。

## 3. 角色矩阵

| 业务角色 | 系统角色 | 核心路径 |
|---|---|---|
| 营销公司 | `project_manager` | 新建项目、客户样板、进度 |
| 涂装工艺部 | `process_engineer` | 涂料开发、样板、标准板、一致性 |
| 采购部 | `purchaser` | 涂料采购、材料换版 |
| 质量管理部 | `quality_engineer` | 性能试验、第 12/17 步评审 |
| 生产部 | `process_engineer` | 首台计划、试制、排产、批量生产 |
| 财务部 | `finance` | 第 13 步固定收费 |
| 项目经理 | `project_manager` | 风险、停滞、负责人、复盘 |
| 管理员 | `admin` | 组织、角色、参数、日志、调度 |
| 查看者 | `viewer` | 只读与写入拒绝 |

local 通过受控 mock 身份覆盖全部角色；最终验收必须再由真实飞书 OAuth 会话覆盖角色矩阵。

## 4. 业务项目

- `R23-UAT-正常主线-深海蓝`
- `R23-UAT-评审退回-星河银`
- `R23-UAT-非阻塞支线-极光白`
- `R23-UAT-逾期停滞-赤霞红`
- `R23-UAT-材料版本-沙岩灰`
- `R23-UAT-月度跟踪-冰川蓝`
- `R23-UAT-并发编辑-琥珀金`

自动化追加时间戳和唯一编号；测试结束后按 `R23-UAT-` 前缀归档或清理。

## 5. 执行阶段

1. 冻结候选分支并记录 commit、镜像、migration、测试窗口。
2. 在独立 staging 验证真实飞书 OAuth、mock 关闭和环境隔离。
3. 当前代码重新执行核心 18 步业务规则和角色权限路径。
4. 执行并发、陈旧数据、重复提交、断网/上传中断、401/403/500、刷新/后退、必交材料、换版、复盘、定时任务幂等。
5. 修复 P0/P1；每项先有失败证据与回归用例，再执行目标测试和全量回归。
6. 仅对 staging 温和执行 `5 VU × 2h`、`10 VU × 30m`、`20 VU × 5m` 只读负载。
7. 更新报告和执行账本；只有全部门禁通过才能结束 R23。

## 6. 性能门槛

| 指标 | 门槛 |
|---|---:|
| 普通查询 API p95 | `< 800 ms` |
| 普通写入 API p95 | `< 1500 ms` |
| 主要页面可交互 | `< 3 s` |
| 5xx | `< 1%` |
| 2 小时后 API+Web 内存增长 | `< 20%` |
| 重复任务、数据库死锁、容器重启 | `0` |
| unhandled rejection / uncaught exception | `0` |

## 7. 证据

- `test-results/r23/screenshots/`
- `test-results/r23/traces/`
- `test-results/r23/videos/`
- `test-results/r23/har/`
- `test-results/r23/api-snapshots/`
- `test-results/r23/performance/`
- `test-results/r23/logs/`

## 8. 停止条件

P0/P1 未关闭、真实角色矩阵不完整、2 小时耐久未完成、全量回归失败或证据 commit 不一致时，R23 必须为 `BLOCKED/FAIL`，不得进入 R24。
