# R26P 观察记录

```text
OBSERVATION_STATUS=NOT_STARTED
REASON=PRODUCTION_CANDIDATE_ROLLED_BACK_BEFORE_GATE_10
```

候选版本没有进入 72 小时观察期。发布前版本恢复后五项服务 active，公网 API health
正常，systemd failed unit 为 0。

重新发布时必须重新开始完整 72 小时观察，并监控 OAuth、API/Nginx 5xx、服务重启、
PostgreSQL、Redis、磁盘、内存、进展、材料和审计接口。

## R26P1 重新开始

```text
OBSERVATION_STATUS=IN_PROGRESS
STARTED_AT=2026-07-25
RUNTIME_COMMIT=5035f1b0ccbb09cd1990dc75dba6f65dd6a14248
BASELINE_API_RESTARTS=0
BASELINE_WEB_RESTARTS=0
BASELINE_POST_DEPLOY_ERRORS=0
BASELINE_LARK_REQUESTS=0
```

正式团队 OAuth、登出、旧会话失效、再次登录和 V2 有限只读业务冒烟已通过。稳定标签
仍受观察期约束；本轮只创建新的 RC 候选。
