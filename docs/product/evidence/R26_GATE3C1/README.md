# R26 Gate 3C1 证据索引

## 1440

| 文件 | 证明内容 |
| --- | --- |
| `01-1440-completion-precheck.png` | 完成前检查、权限、taskVersion 与推进影响 |
| `02-1440-serial-step1-success.png` | 第 1→2 步成功反馈 |
| `03-1440-step4-parallel-preview.png` | 第 4 步只预览第 5、6 步 |
| `04-1440-step4-parallel-success.png` | 第 5、6 步并行创建结果 |
| `05-1440-step6-nonblocking-preview.png` | 第 6 步只预览第 7、9、10 步 |
| `06-1440-step6-nonblocking-success.png` | 第 9 步非阻塞支线和主线结果 |
| `07-1440-step10-serial-preview.png` | 第 10→11 步完成前检查 |
| `08-1440-step11-stop-before-step12.png` | 第 11 步完成并生成第 12 步 |
| `09-1440-step12-special-actions-disabled.png` | 第 12 步专项写动作保持关闭 |
| `10-1440-open-blocker-prevents-completion.png` | 开放阻塞准确阻断 |
| `11-1440-blocker-resolved-completion-enabled.png` | 解除阻塞后完成门禁通过 |
| `12-1440-required-material-blocks-completion.png` | 缺少必交材料准确阻断 |
| `13-1440-concurrent-winner.png` | 并发成功标签 |
| `14-1440-concurrent-409.png` | 并发失败标签返回 409 |

## 1024

| 文件 | 证明内容 |
| --- | --- |
| `15-1024-completion-preview.png` | 真实 1024×900 视口完成抽屉与地图上下文 |

## 390

| 文件 | 证明内容 |
| --- | --- |
| `16-390-fullscreen-completion-sheet.png` | 真实 390×844 全屏完成 sheet、独立滚动和固定底部动作 |

## 回放

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `R26_GATE3C1_REAL_UAT_1440.mp4` | 串行、并行、非阻塞、门禁和并发组合回放 | `0212fb0a900893ad2a798afb8baff2ac311ed58ef54da8a40142a0540218d995` |
| `R26_GATE3C1_RESPONSIVE_UAT.mp4` | 1024 与 390 响应式组合回放 | `f936c6c35d4b0e9520add54c3c6a5d2becdcb10a8bdceedbe2b917f79a734f79` |

MP4 是真实浏览器交互帧按时间顺序合成的验收回放，不声明为未经剪辑的连续录屏。

## 组合证明

API 写请求、数据库拓扑、阻塞、幂等和审计见 `API_AND_DATABASE_PROOF.md`。
