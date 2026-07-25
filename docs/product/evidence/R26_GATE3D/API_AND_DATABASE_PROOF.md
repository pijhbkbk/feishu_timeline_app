# R26 Gate 3D API、数据库与审计证明

## 项目与任务

```text
project.code          G3C1-SERIAL-20260724-2301
project.status        COMPLETED
project.currentNode   PROJECT_CLOSED
workflow task rows    19
step 12 round 1       REJECTED
step 12 round 2       APPROVED
step 13               COMPLETED
step 14               APPROVED
step 15               COMPLETED
step 16               COMPLETED
step 17               APPROVED
step 18               COMPLETED
```

第 5、7、9 步仍为非主线活动任务，第 8 步尚未生成；这与冻结拓扑中的非阻塞支线语义
一致，未为通过 UAT 而伪造状态。

## 评审与月度实例

```text
CAB_REVIEW                     REJECTED -> APPROVED
COLOR_CONSISTENCY_REVIEW       APPROVED
VISUAL_COLOR_DIFFERENCE_REVIEW 12 records / all APPROVED
recurring tasks                12 / 12 COMPLETED
planned date range             2026-08-24 .. 2027-07-24
```

## 收费、生产与退出

```text
development fee     10000.00 CNY / PAID / completed
schedule plan       120 / CONFIRMED / R26-G3D-BATCH-001
mass production     planned 120 / actual 118 / COMPLETED
color exit          annualOutput 12 / threshold 20
system suggestion   EXIT
final decision      EXIT
exit completed      true
```

## 工作流转移与审计

- 工作流转移：25 组可追溯动作；
- 审计记录：94 条；
- 评审、收费、生产、退出相关审计：60 条；
- 最终审计依次包含颜色退出记录创建、工作流完成、项目完成和颜色退出完成；
- 所有证据来自 `feishu-timeline-staging-postgres`，未查询或修改 production。

## 备份

```text
pre-deploy backup
42ac88e34873473a64dfc822d905f5107d8f28a9ec08b0bcbde4f67d9be2c36d

post-UAT pre-final-deploy backup
216a56cd884fba138466584f43b2ce7351de7f2ce98da86f6e22872b6b51d9e6
```

两份自定义格式 PostgreSQL dump 均使用 `pg_restore -l` 成功读取目录。

