# c5 → 原生登录体验版本：固定运维接续准备

本文件只记录本轮独立 Ops 实现及本地验证，不证明新版本已经部署。工作区 `/private/tmp/timeline-login-release-ops-20260918`，分支 `codex/native-login-release-20260918`。实现提交 `b4bb33453d66e94adfa8eec013a11e223b26e35e`；当前 `native_release_target_20260918.py` 明确保留 `TARGET=None`，因此固定包生成和程序更新均被拒绝。候选的实际镜像 RepoDigest 回读和独立静态审查完成后，才可另行固定完整 Ops 提交及七脚本。

## 不变起点

- 已知生产稳定版本：`c5aed415cd17e6e8a21b422a4c5c92b4b924e091`，tree `830e562f5ec56e99d7fc0b04432fc056dd772254`，release `native-portable-20260917-c5aed415cd17`，buildTime `2026-09-17T08:04:51Z`。
- 当前安装的控制器源码为 bf2，实际摘要依据既有脱敏生产回读；其后82ad只新增证据。此任务没有重新连接服务器，不能把既有回读描述成本轮现场检查。
- 状态仍使用原 `/var/lib/timeline-native-app/release-6c70-state.json`，严格 version=1、active=committed=c5、pending=false。文件名保留历史事实；不重置状态，不落回6c70或首次原生迁移版本。
- DB仍为 `feishu_timeline_restore_c38c57da`；原对象目录、专用Redis和原始迁移收据不变。正常更新及回退不执行数据库restore、migration、seed或账号初始化。
- 曾比较的源码为 `6fd49d9a606ee357347ad7aaad5751c23e6e3260`、tree `e2b5894d5206750b76b12fe51746181c58a864a0`。本地不可变比较有19个API/Web源码文件变化、无schema/依赖变化；这只是历史比较记录。根任务真实HTTP发现全局隐式转换使数字用户名被接受，已撤回6fd候选并准备DTO修复；此Ops没有绑定它或生成发布包。最终新源码及镜像待根任务提供，必须重新核对全套19项或新的实际差异集合。

## 最小变更与安装顺序

| 模块 | 本轮限定变更 |
| --- | --- |
| `native_release.py` | 固定OLD为c5，保留c5实际镜像和四项身份；c5选原`*-20260917.env`，候选另用`*-login-20260918.env`；本轮checkpoint独立；新旧API均要求真实exit0、无OOM、同一容器与PID0，绝不把c5误归类为旧程序强杀例外。 |
| `native_release_target_20260918.py` | 新增本轮固定目标模块。原`native_release_target.py`原字节保留，使旧控制器在新目标安装后仍可正常识别c5。 |
| `build_native_release_bundle.py` | 安装载荷仅上述两个文件，先新目标、最后原子替换控制器。固定校验其余9个Python依赖和4个unit的bf2实际摘要，不重装它们；所有API/Web源码差异须与最终允许文件及SHA精确相等，依赖/schema/seed变更一律拒绝。 |
| `release-tools/install-template.py` | 仅接受精确bf2/本轮新controller摘要和稳定c5；独立`controller-install-login-20260918.json`及`controllers-before-login-20260918`；双锁、root路径、原件、临时写fsync与原子激活保留。三发布unit只接受固定文件、无override、无PID、inactive/failed，不清历史失败。安装不启动/停止应用或reload daemon。 |
| `release-tools/driver-template.py` | 用独立`release-login-20260918-*`proof，继续要求本轮真实演练invocation/checkpoint/protection绑定；保留程序回退与全数据指纹保护。 |
| `release-tools/checkout-template.py` | 本轮固定私有refs为`refs/heads/codex/native-login-release-20260918`和`refs/heads/codex/native-login-ops-20260918`；旧refs/main/tag不变。 |

原子切换前运行旧controller+原目标，切换后运行新controller+新目标；两者都认识现有稳定c5。安装中断仅留下未激活的私有临时文件或完整已激活文件，journal与原件可据固定摘要续装。现有c5环境文件及所有09-17备份、原件、失败/成功收据原样保留。旧单用途socket修补生成器和模板保持历史原文，本轮不调用它们。

更新仍沿checkout、pull、install、rehearse、update、proof顺序，rollback仅作为明确选择的程序回退步骤。真正执行时须先取得新现场只读核对、实际source/image readback和独立审查；不能执行旧09-17固定包。rehearse和update会短暂关闭本应用入口，须保留真实维护观察。回退返回c5程序并保留当前数据库和对象，不把过去备份覆盖到现存数据。c5的登录DTO与校验路径可以接受已有8字符密码散列，散列算法及schema不变；这一项目前为源码兼容依据，不能冒充实际回退登录验证。

## 实际本地验证

- Python 3.12，11个明确的运维测试模块，**129 tests PASS**，退出码0。原始本机日志 `/private/tmp/timeline-login-ops-tests-20260918-attempt2.log`，摘要见同目录JSON证据。
- 安装夹具真实加载bf2及本轮两个控制器，覆盖4个写点分别半写/完整写中断、4个原子激活后的中断；共12种中断场景均仍能读取稳定c5及其既有env，随后续装与重复运行保留原件、历史文件和状态。
- 负向覆盖pending、错误起点、新轮次已存在checkpoint/proof、未知controller/target摘要、未journal的新文件、运行中或override的服务；在私有文件写入前拒绝。
- 实际driver的update/proof读取分支在只有旧09-17成功proof时拒绝，未发出任何systemctl调用；不只检查前缀文本。
- 新旧两API exit1/137/143均不能被记为优雅排空或进入保护备份；正常exit0通过。既有socket无MainPID例外、PG/对象/Redis保护、共享锁、回退与超时透传回归均通过。
- 13个不变依赖/unit文件摘要逐项相等，`git diff --check`通过。未执行SSH、Docker、真实systemd、真实PG写入、生产发布或公网测试。模拟中断使用本地受控异常，不能替代生产SIGKILL演练或主机重启验证。

## 当前状态

`CODE_IMPLEMENTED / LOCAL_VERIFIED / TARGET_IDENTITY_PENDING / INDEPENDENT_REVIEW_PENDING / PRODUCTION_UNCHANGED_BY_THIS_TASK`。没有新staging；本任务未改main/tag；产品确认与精确域名浏览器验收由根任务完成。本轮没有修改Web应用，未进行Placeholder或页面验收。源码和本地PASS不代表新候选已经在网站运行。
