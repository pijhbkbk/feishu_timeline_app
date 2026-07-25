# R26P 生产冒烟

## 结果

```text
RESULT=FAIL
FAILED_AT=FEISHU_OAUTH
PRODUCTION_WRITES=0
```

## 已验证

- 生产登录入口可生成带 state 的飞书 OAuth URL。
- callback 指向 `https://timeline.all-too-well.com/login/callback`。
- mock 登录关闭。
- 生产域名、TLS、HSTS、API health 和未登录 session 接口正常。
- 候选版本正式入口默认使用 V2，`/v2/*` 不是唯一新版入口。
- 页面未发现 `DEMO - ACTIVE`、`demo-r26`、fixture 或 staging 可见文案。

## 失败证据

飞书授权页返回“没有应用使用权限”，显示当前登录账号所属测试企业不在应用可用范围。
切换公司飞书会话后到达二维码“扫描成功”状态，但没有完成授权回跳，不能视为 OAuth
成功。

## 未执行

由于登录门禁失败，以下动作按规则没有在 production 执行：

- 受保护的工作台、项目、任务、流程地图和系统管理读验证；
- `PROD-SMOKE-R26P-*` 隔离项目；
- 草稿、进展、材料和材料版本有限写入；
- 管理员审计列表、详情和权限拒绝验证；
- logout 后旧会话失效验证。

未对真实业务项目进行任何写入。
