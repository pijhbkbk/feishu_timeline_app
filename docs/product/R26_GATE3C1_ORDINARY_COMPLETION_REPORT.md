# R26 Gate 3C1 普通工序完成报告

## 结论

Gate 3C1 已在独立 staging 实现并完成真实飞书用户技术 UAT，当前等待产品负责人
人工确认。

```text
R26_GATE3C1_IMPLEMENTED
ORDINARY_TASK_COMPLETION_ENABLED_ON_STAGING
PARALLEL_AND_NONBLOCKING_TRANSITIONS_VERIFIED
STEP12_AND_LATER_SPECIAL_ACTIONS_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3C1_CONFIRMATION
STOP_BEFORE_GATE3C2
```

本轮没有部署 production、修改 V1、合并 `main`、创建 tag 或进入 Gate 3C2。

## 基线与范围

| 项目 | 值 |
| --- | --- |
| Gate 3B 产品批准提交 | `4f92e8d67f808402d6607c13cc30aa3281f69ec7` |
| Gate 3C1 分支 | `codex/r26-gate3c1-ordinary-task-completion` |
| staging URL | `http://localhost:8080` |
| 真实飞书用户 | 李晓晨 |
| 数据库迁移 | `20260724222000_add_r26_gate3c1_completion` |
| production 请求 | `0` |

开放范围严格限于第 1～11 步普通工序：

- 普通串行完成和服务端自动推进；
- 第 4 步完成后只创建第 5、6 步；
- 第 6 步完成后只创建第 7、9、10 步；
- 第 9 步为非阻塞支线；
- 第 10 步完成后进入第 11 步；
- 第 11 步完成后生成第 12 步，但第 12 步专项写动作保持关闭。

## 产品交互

工序详情底部现在明确区分：

- `提交工作进展`：继续使用 Gate 3B，不改变任务状态；
- `完成工序`：打开完成前检查，不直接推进。

完成面板展示：

1. 必填表单；
2. 必交材料与准确缺失项；
3. 开放阻塞；
4. 当前负责人和完成权限；
5. `taskVersion`；
6. 将创建的后续任务；
7. 服务端分配的建议负责人、责任部门和分配来源；
8. 主线、并行和非阻塞支线说明。

条件不足时显示“暂时不能完成工序”和逐项原因。开放阻塞可填写解决说明与实际
解除时间后解除；普通用户没有“强制忽略阻塞并完成”入口。

确认提交必须携带：

- `taskVersion`；
- `Idempotency-Key`；
- `completionReason`；
- `acknowledgedConsequences=true`。

成功后返回已完成工序、新任务、负责人、责任部门、项目当前主线和
`workflowVersion`，并局部刷新流程地图、详情、工作台、项目卡、我的任务、
项目记录和成员任务数量。

## 后端实现

V2 没有建立第二套状态机。Gate 3C1 通过薄命令层调用已有：

- `WorkflowsService`；
- 冻结工作流节点定义；
- Gate 3A 分配服务；
- 项目访问与权限守卫；
- 既有 SLA、审计和通知能力；
- Prisma 事务与服务端幂等。

命令接口仅有：

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| POST | `/api/v2/tasks/:taskId/completion-preview` | 只计算完成条件和推进影响，不写业务状态 |
| POST | `/api/v2/tasks/:taskId/complete` | 在串行化事务中完成当前任务并按冻结拓扑推进 |
| POST | `/api/v2/tasks/:taskId/blockers/:blockerId/resolve` | 解除当前任务的开放阻塞并写审计 |

客户端不能提交下一节点代码或新负责人。负责人仅使用 Gate 3A 的服务端优先级：

1. `TASK_OVERRIDE`
2. `PROJECT_NODE_OVERRIDE`
3. `PROJECT_DEPARTMENT_LEAD`
4. `PROJECT_DEFAULT_ASSIGNEE`
5. `SINGLE_ELIGIBLE_MEMBER`
6. `UNASSIGNED`

没有匹配成员时保持“待分配”，不回退成项目负责人。

## 真实 staging UAT

测试项目均通过真实 V1 立项页面创建，未使用 fixture 或 seed：

| 用途 | 项目 |
| --- | --- |
| 串行与拓扑 | `R26-G3C1-UAT-普通推进-20260724-2301` |
| 并行隔离预留 | `R26-G3C1-UAT-并行分支-20260724-2301` |
| 阻塞解除 | `R26-G3C1-UAT-非阻塞-20260724-2301` |
| 并发幂等 | `R26-G3C1-UAT-并发幂等-20260724-2301` |

真实浏览器完成了：

1. 第 1→2、2→3、3→4；
2. 第 4 步只创建第 5、6 步，主线为第 6 步；
3. 第 6 步只创建第 7、9、10 步，第 9 步明确非阻塞；
4. 第 9 步保持未完成，第 10→11→12 仍可推进；
5. 第 11 步生成第 12 步后，第 12 步没有完成/评审专项写入口；
6. 第 5 步缺少“颜色编号确认单”时准确阻断；
7. 实际申报“等待供应商确认交付时间”阻塞，完成被拒绝；
8. 填写解决说明和实际解除时间后解除阻塞，完成门禁即时通过；
9. 两个标签使用相同 `taskVersion` 并发完成，一个成功，另一个收到 409；
10. 成功标签只创建一个第 2 步任务，数据库只有一条完成命令。

数据库与审计组合证明见
`docs/product/evidence/R26_GATE3C1/API_AND_DATABASE_PROOF.md`。

## 响应式与浏览器结果

- 1440：地图上下文、完成前检查、并行影响、阻断和成功反馈可读；
- 1024：真实 `1024×900` 视口，660px 抽屉保留364px 地图上下文，无横向溢出；
- 390：真实 `390×844` 视口，完成面板为全屏 sheet，内容独立滚动，底部主动作固定；
- console error：0；
- page error：0；
- production request：0。

UAT 中发现 Gate 3C1 的后置 `94vw` 规则会覆盖移动端全宽抽屉，已修为移动端
`width: 100%; max-width: none` 并增加 CSS 回归测试。

## 自动化门禁

自动化覆盖：

- 冻结拓扑与 4/6 步并行；
- 第 9 步非阻塞；
- 第 12 步及以后拒绝；
- 缺材料与开放阻塞准确原因；
- 负责人/项目负责人正向、观察者 403；
- 陈旧 `taskVersion` 与串行化冲突 409；
- 幂等回放与明确后果确认；
- 三个 Gate 3C1 客户端路径白名单；
- 评审、收费、月评和退出等越界路径前端零请求；
- 390px 全屏完成面板 CSS 回归。

完整仓库命令与最终提交记录在 `docs/EXECUTION_LEDGER.md`。

## 明确未做

- 未开放第 12 步通过或退回；
- 未开放第 13 步收费；
- 未开放第 14～16 步专项推进；
- 未开放第 17 步 12 个月评审；
- 未开放第 18 步颜色退出；
- 未提供强制忽略阻塞；
- 未修改 V1；
- 未访问或部署 production；
- 未合并 `main`，未创建 tag；
- 未自动进入 Gate 3C2。

