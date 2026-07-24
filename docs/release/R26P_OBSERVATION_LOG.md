# R26P 观察记录

```text
OBSERVATION_STATUS=NOT_STARTED
REASON=PRODUCTION_CANDIDATE_ROLLED_BACK_BEFORE_GATE_10
```

候选版本没有进入 72 小时观察期。发布前版本恢复后五项服务 active，公网 API health
正常，systemd failed unit 为 0。

重新发布时必须重新开始完整 72 小时观察，并监控 OAuth、API/Nginx 5xx、服务重启、
PostgreSQL、Redis、磁盘、内存、进展、材料和审计接口。
