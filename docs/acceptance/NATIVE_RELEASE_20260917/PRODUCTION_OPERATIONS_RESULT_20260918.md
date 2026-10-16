# 生产运维结果（2026-09-18 补证）

生产程序于 **2026-09-17 09:27:01.821805 UTC** 完成固定版本更新。运行 commit 为 `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，Ops commit 为 `bf2cf83a0bd172a6e9360d5e7f3533912a062813`。2026-09-18 00:19:19–00:19:23 UTC（北京时间 08:19）再次只读访问两个精确 HTTPS 元数据入口，均返回 200、TLS 验证结果0，且身份一致。

完整脱敏记录、原始私有记录摘要、每步退出状态及维护观察见 [production-operations-evidence-20260918.json](production-operations-evidence-20260918.json)。这里记录受控发布与服务器验证；精确域名浏览器交互、业务路径及产品负责人确认由根任务另行交付。

## 最终运行身份

| 项目 | 实际记录 |
| --- | --- |
| 环境与网址 | production，`https://timeline.all-too-well.com` |
| hostname | `timeline.all-too-well.com` |
| 数据库 | `feishu_timeline_restore_c38c57da` |
| runtime commit / server HEAD | `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，工作树干净 |
| source tree | `830e562f5ec56e99d7fc0b04432fc056dd772254` |
| release | `native-portable-20260917-c5aed415cd17` |
| buildTime | `2026-09-17T08:04:51Z` |
| API RepoDigest | `us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api@sha256:40544930b329416679f24ebc6dd2354e24beaec9d8490b9edbdbda5e0f71d192` |
| Web RepoDigest | `us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/web@sha256:774419239cea09f8d341fd29ed34361b47012c720bafbe7a3a5ef0d60ffa187b` |
| Nginx upstream | API `127.0.0.1:3001`；Web `127.0.0.1:3000` |
| 发布状态 | active=committed=c5，pending=false；固定 update 和 proof 均 exit0 |
| 数据库迁移元数据 | 37条完成记录及其 checksum 逐项匹配固定c5源码；未完成且未回滚记录0。本次只读核对，未执行迁移 |

API `/api/health`、Web `/build-info`、运行镜像标签、服务器源码 HEAD 与固定目标保持一致。09-18补证仅读取上述公开元数据，没有再次部署、停机、演练、迁移或发出认证/业务请求。

## 失败保留、修复与演练

1. d16 固定包的 checkout、pull、install 均成功。最初附加只读探针错误要求所有发布单元均为 inactive；实际保留着09-14演练的 failed 状态。核对历史 Invocation、退出码及当前无进程后，沿原已审 `inactive/failed` 合同继续，未清除旧失败记录。
2. 首次真实 rehearsal **FAIL**：Invocation `8611860cee4a42e9a064b757ba20e8ed`，08:59:52 UTC 检查点前发生 `KeyError: MainPID`。此轮没有生成保护备份，没有执行预定 SIGKILL。监督器08:59:54 UTC成功恢复稳定6c70；该失败不计PASS。
3. 只读实际属性及本地RED回归确认，两固定 systemd socket 没有 MainPID 字段。最小修复仅允许这两项缺该字段；service仍要求明确MainPID=0，所有单元仍必须inactive且ControlPID=0。容器、PG会话、prepared transaction、角色及Redis退出门禁保留。
4. bf2 的精确原子修补成功，旧helper与安装journal原件保留，新helper及journal逐项读回一致。126项本地controller测试通过，包括真实socket形状RED→GREEN、负向门禁及6个原子写点分别半写/完整写后的中断续装。独立静态审查提交 `335b2591243786453a2a5cf94c962da71553b3c9`；审查者没有执行这些测试或访问生产。
5. 修正后的唯一一次 rehearsal **PASS**：Invocation `60da2ab6eb8d4569ae2025e92ed29a53`。真实保护备份完成后，固定检查点执行SIGKILL，监督器恢复6c70，52表指纹、对象核验通过。未恢复数据库、未重放迁移、未演练整机重启。
6. 根任务读取实际PASS后授权一次 update，再执行 proof；两者均成功。没有盲目重试更新。

旧6c70 API实际退出码为137，收据明确记录 `apiDrainSupported=false`、`apiGracefulDrainVerified=false`、`legacyApiFreezeOnly=true`。一致备份依据所有写入者退出、角色冻结、无PG会话/预备事务及前后数据指纹一致取得；没有把旧程序强制退出称为优雅排空。

## 保护备份及维护观察

| 操作 | 受保护备份 | 实际范围 |
| --- | --- | --- |
| 修正演练 | `20260917T092220Z-2bbb186c` | 52表、0个业务对象、3个专用Redis文件；dump 277587字节 |
| 正式更新 | `20260917T092643Z-3d9c4f8a` | 52表、0个业务对象、3个专用Redis文件 |

备份继续保留在原服务器root专用受保护目录；证据仅包含收据和摘要，不包含备份数据、凭据或会话材料。未执行数据库恢复、seed或迁移，未改共享应用。

- 修正演练的两个入口socket：09:21:03 UTC关闭，09:22:29 UTC重新启用。外部正常TLS首次观察恢复200：Web 09:22:45 UTC，API 09:22:52 UTC。
- 正式更新的两个入口socket：09:25:32 UTC关闭，09:27:00 UTC重新启用。外部正常TLS首次观察最终c5的200：Web 09:27:05 UTC，API 09:27:10 UTC。
- HTTP轮询时间为观察边界，不能当成精确应用停机起止；原始记录保留请求开始/完成时间。短连接超时与真实HTTP502分开记录。初版Python观察客户端的传输失败已保留，未计作网站宕机。

## 临时访问与范围

09-18实际进程核对：本子任务的三个临时observer均已停止，停止标记保留。私有镜像pull的临时认证目录于09-17 08:41:14 UTC实际只读回验计数为0；09-18未重新访问服务器核对该目录。私有Git传输使用既有严格IAP连接和原用户SSH密钥，本Ops子任务没有创建临时SSH公钥，没有修改或删除原用户凭据。

最终私有runtime ref为 `refs/heads/codex/native-portable-release-20260917`（c5），Ops ref为 `refs/heads/codex/native-portable-ops-20260917`（bf2）。Ops推送前后其他私有refs一致；本子任务未改main或tag。本证据另行提交，不能替换已经固定的runtime/Ops身份。

## 本证据范围内的交付状态

| 项目 | 状态 |
| --- | --- |
| 代码实现 | CODE_IMPLEMENTED：控制器与限定socket修复 |
| 本地测试 | LOCAL_VERIFIED：126项通过；独立审查为只读静态审查 |
| staging URL / runtime / 用户路径 | 本Ops子任务未建立或验收staging；不复用其他环境结论冒充 |
| production是否改变 | 是，09-17完成c5程序更新；09-18只读补证 |
| production runtime | `c5aed415cd17e6e8a21b422a4c5c92b4b924e091` |
| production用户路径 | 本报告验证公开元数据与运行身份；真实浏览器及业务验收由根任务记录 |
| main / tag | 本子任务未改变 |
| 产品负责人确认 | AWAITING_PRODUCT_OWNER_CONFIRMATION；本子任务不代表负责人验收 |
| 未完成路由 / Placeholder | 本子任务不执行前端路由验收或Placeholder统计；由根任务结合最终浏览器证据记录 |
| 当前范围状态 | 服务器运行与发布保护已验证；仅据本报告仍为DEPLOYMENT_UNVERIFIED，需合并根任务的精确域名浏览器验收证据 |
