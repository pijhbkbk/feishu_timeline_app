# R26 Gate 3B 证据索引

## 1440

| 文件 | 证明内容 |
| --- | --- |
| `01-workspace-before-1440.jpg` | 提交前工作区和当前任务 |
| `02-progress-step1-1440.jpg` | 第一步自动带出项目、工序、人员和截止时间 |
| `03-progress-blocked-1440.jpg` | 阻塞字段、人员/部门协助和预计解除时间 |
| `04-material-v1-uploaded-1440.jpg` | 安全上传材料 V1 |
| `05-material-version-history-1440.jpg` | 替换为 V2 并保留 V1 历史 |
| `06-progress-success-invariant-1440.jpg` | 提交成功且任务/工作流未推进 |
| `07-workspace-synced-blocker-material-1440.jpg` | 地图阻塞角标与材料联动 |
| `08-workspace-detail-synced-1440.jpg` | 工序详情联动 |
| `09-dashboard-live-facts-1440.jpg` | 工作台当前任务事实 |
| `10-dashboard-activity-synced-1440.jpg` | 工作台最新动态联动 |
| `11-project-list-risk-synced-1440.jpg` | 项目卡风险、责任和预计解除时间 |
| `12-project-records-synced-1440.jpg` | 中文项目记录，无内部动作代码 |
| `21-draft-saved-1440.jpg` | 草稿保存和恢复 |
| `22-draft-deleted-history-preserved-1440.jpg` | 草稿删除后正式历史保留 |

## 1024

| 文件 | 证明内容 |
| --- | --- |
| `13-progress-history-1024.jpg` | 进展历史与材料版本 |
| `14-workspace-drawer-1024.jpg` | 抽屉打开时地图仍保留上下文 |
| `15-workspace-blocker-1024.jpg` | 阻塞摘要和可执行动作 |

## 390

| 文件 | 证明内容 |
| --- | --- |
| `16-workspace-fullscreen-sheet-390.jpg` | 移动全屏工序 sheet |
| `17-workspace-node-overview-390.jpg` | 移动节点总览 |
| `18-progress-form-390.jpg` | 移动三步进展表单 |
| `19-progress-input-focus-390.jpg` | 输入焦点/键盘状态 |
| `20-progress-action-footer-390.jpg` | 固定底部主动作不遮挡内容 |

## 回放与样本

| 文件 | SHA-256 |
| --- | --- |
| `R26_GATE3B_REAL_UAT_1440.mp4` | `d8a5c46d97f42101dc25d714b259edb69f228b098914a4a61914ade60c10af7a` |
| `R26_GATE3B_REAL_UAT_390.mp4` | `85f4deb5e8b42dc4c5cd4e4943421cc711f926ad3c687e49e23bead1dacb87cb` |
| `uat-progress-proof-v1.pdf` | `615305838cb51902768f5eecae166afaa3227584364bb2286e590970ad069afb` |
| `uat-progress-proof-v2.pdf` | `5f8d02a42ee7045be2b8167bf31982e864ec254ee6b6cba5a19b883622c7c51a` |

MP4 是真实浏览器交互帧按时间顺序合成的验收回放，不声明为未经剪辑的连续录屏。
浏览器控制台最终为 error 0、warning 0、page error 0。

## 组合证明

API 写请求、审计动作和数据库不变量见 `API_AND_DATABASE_PROOF.md`。每次部署会重建
nginx 容器并重置其短期日志，因此上传/提交使用数据库审计和 UI 截图交叉证明；
最后一次部署后的草稿保存/删除仍同时保留 nginx 请求计数。
