# RELEASE_NOTES_v1.0.0

## 版本概览

- 版本号：`v1.0.0`
- 发布主题：轻卡定制颜色开发项目管理系统 MVP 正式发布
- 发布日期：`2026-04-23`
- 发布范围：R00 ~ R13 全部已通过轮次的交付内容

## 核心能力

- 完整的颜色开发项目主流程，覆盖第 1 步至第 18 步
- 第 12 步评审门禁、驳回回第 11 步并生成新轮次
- 第 9 步并行但不阻塞主线
- 第 13 步固定收费金额 `10000`
- 第 17 步自动生成 12 个月度评审实例
- 第 18 步年产量录入与退出建议
- 飞书登录链路、权限控制、附件管理、审计日志
- staging / production 部署、健康检查、回滚、巡检、备份恢复
- UI/UX 精修与 Playwright 浏览器级关键路径回归

## 本版本重点收口

### 业务规则与验收

- 已完成生产口径 UAT 与硬门禁核验
- 已清理与冻结规则冲突的旧演示/种子口径
- 已补齐权限与固定收费金额门禁

### 部署与运维

- 已沉淀 staging 一键部署、生产重部署、health-check、ops-check、SSL 检查、HTTP 5xx 检查、PostgreSQL 备份恢复脚本
- 已完成生产 HTTPS、Nginx、systemd、PostgreSQL、Redis 基线验证

### 前端交付

- 已统一页面标题、按钮、状态颜色、空态/错误态/无权限态
- 已精修第 12 步评审工作区、第 17 步月度评审台账、第 18 步颜色退出页
- 已接入 Playwright，并覆盖关键登录、项目创建、评审驳回、月度评审和颜色退出场景

## 自动化与验证基线

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @feishu-timeline/web build`
- `pnpm test:e2e`
- `pnpm playwright:test`
- `bash scripts/deploy/gce-release-verify.sh`
- `bash scripts/deploy/gce-production-acceptance.sh`

## 生产入口

- 正式地址：[https://timeline.all-too-well.com](https://timeline.all-too-well.com)
- 根域占位：[https://all-too-well.com](https://all-too-well.com)

## 已知可延期优化项

- 当前告警仍以脚本非零退出码为主，尚未接入 webhook / 邮件 / 第三方监控平台
- recurring task 仍通过“展示边界说明”而不是直接并入截止日历
- Playwright 目前覆盖关键路径，但尚未扩展到更多角色矩阵、移动端视口和视觉基线
