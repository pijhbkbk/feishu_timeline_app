# Staging 部署文档

## RC2 当前合同与执行边界

本节是当前 manifest 合同；下方 R09 命令说明为历史部署背景。当前仓库内 activation、rollback、legacy restore 入口保持 fail-closed，不能用本文开启部署。实际切换仍需经批准的外部 root-owned / digest-bound 控制器、明确环境和数据库/回滚授权。

`scripts/deploy/release-identity.mjs` 是生成与校验的共同入口：

- **Runtime manifest v1** 严格包含 `schemaVersion: 1`、`identity` 和六项 `images`。identity 为 `sourceCommit/sourceTree/release/buildTime`；images 为 `api/apiOps/web/postgres/redis/nginx`，每项包含 `imageId/repositoryDigest`。原 `validate-manifest`、`validate-approval`、`verify-evidence` 和启动/health 消费保持不变，不接受额外审计字段。
- **Candidate evidence v1** 使用 `kind: candidate-evidence` 区分，包含相同 identity、`runtimeManifestSha256`、`parentCommit`、`targetPlatform`、`platformEvidence`、`checks`。它用于发布前审查材料一致性检查，不作为应用启动依赖，不能替代 runtime manifest。
- `runtimeManifestSha256` 是严格校验后、由工具固定字段顺序返回的 runtime JSON 的 UTF-8 SHA-256。candidate 的外部固定摘要同样由严格规范化 JSON 计算；空格和输入键顺序不改变身份，内容变化会改变摘要。审查材料提交不修改应用 sourceCommit/sourceTree。
- `targetPlatform` 接受 `linux/amd64`、`linux/arm64`；缺少目标环境依据时为 `null`，不得代入开发机架构。`platformEvidence` 是相对路径与原始文件 SHA-256 的引用，文件内容是六项 Docker image inspect 数组的对象。验证每个 imageId、repositoryDigest、API/API-ops/Web 的 OCI identity labels，以及全部六项 `Os/Architecture` 与目标平台相同。当前 CI 没有显式固定 CPU/platform；本次源码合同修复未生成真实镜像或实际发布 manifest。
- `checks` 固定包含 `g3/g4Diff/g4Full/secrets/sast/sca/images`。每项为 `{status, artifact}`；状态为 `PASS/FAIL/NOT_RUN`。PASS/FAIL 必须引用实际结果文件 `{path, sha256}`；NOT_RUN 必须为 `artifact: null`。平台材料缺少时允许记录 `null`。生成器允许这样的未完成记录，完整校验拒绝它们。
- 结果文件必须在可信且校验期间不可变的本地证据目录内，路径不得为绝对路径、包含 `..`、经过 symlink 或指向特殊文件；每项上限 16 MiB，平台 JSON 上限 1 MiB。文件摘要绑定原始字节。外部审查者仍须检查报告是否来自要求的工具、对应确切候选、结论是否成立；工具不把报告中的 PASS 声明变成组织批准或扫描执行证明。

先准备 runtime manifest 和 details JSON。details 只包含 `parentCommit/targetPlatform/platformEvidence/checks`；身份及 runtime 摘要由共同生成器补入。以下是操作形式，必须先取得真实材料：

```bash
node scripts/deploy/release-identity.mjs generate-candidate-evidence \
  --manifest runtime.json --details candidate-details.json > candidate-evidence.json
node scripts/deploy/release-identity.mjs candidate-evidence-sha256 \
  --evidence candidate-evidence.json
```

第二条命令只输出待审材料的内容身份。由独立、可信的审查/批准记录固定它；消费时 `--expected-evidence-sha256` 必须来自该外部记录，禁止临时从待验文件算出同值再当作已批准。消费形式：

```bash
node scripts/deploy/release-identity.mjs verify-candidate-evidence \
  --manifest runtime.json --evidence candidate-evidence.json --evidence-root /trusted/evidence \
  --expected-evidence-sha256 "$REVIEWED_EVIDENCE_SHA256" \
  --expected-source-commit "$EXPECTED_SOURCE_COMMIT" --expected-source-tree "$EXPECTED_SOURCE_TREE" \
  --expected-release "$EXPECTED_RELEASE" --expected-build-time "$EXPECTED_BUILD_TIME"
```

成功表示 identity、runtime 内容、外部摘要、七类材料和镜像平台相互一致；仍不是发布授权。无真实平台/镜像/正式扫描时保留未完成，不输出完整候选 PASS。单元和 shell 测试中的合成 manifest 只证明代码合同，不是实际环境证据。

本地回归入口：`node --test scripts/deploy/tests/release-identity.test.mjs`、`bash scripts/deploy/tests/release-identity-health.test.sh`、`bash scripts/deploy/tests/security-hardening.test.sh`。

## 目标

R09 的 staging 方案以 Docker Compose 为中心，提供：

- 前后端容器化
- PostgreSQL / Redis / Nginx 编排
- 独立的 migrate / seed 脚本
- 健康检查脚本
- 一键部署与回滚脚本
- 基础 CI 验证

## 文件入口

- Compose: [deploy/compose.staging.yml](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/compose.staging.yml)
- Compose 环境模板: [deploy/env/staging.env.example](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/env/staging.env.example)
- API Dockerfile: [apps/api/Dockerfile](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/Dockerfile)
- Web Dockerfile: [apps/web/Dockerfile](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/web/Dockerfile)
- Nginx staging 配置: [deploy/nginx/compose.staging.conf](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/nginx/compose.staging.conf)

## 前置条件

1. Docker 29+ 与 Docker Compose v2 可用。
2. 根目录已执行过 `pnpm install`。
3. 若本机已有开发态服务占用 `3000 / 3001 / 5432 / 6379`，不影响 staging。
   staging 默认使用：
   - `8080`：Nginx 入口
   - `3100`：Web 直连
   - `3101`：API 直连
   - `15432`：PostgreSQL
   - `16379`：Redis

## 一键部署

首次部署：

```bash
bash scripts/deploy/staging-up.sh
```

需要补种子数据时：

```bash
RUN_SEED=yes bash scripts/deploy/staging-up.sh
```

脚本行为：

1. 若 `deploy/env/staging.env` 不存在，则由示例文件自动生成。
2. 若当前 tag 的镜像已存在，则直接复用本地镜像；否则构建 `feishu-timeline-api:<tag>` 与 `feishu-timeline-web:<tag>`。
3. 启动 `postgres` / `redis`。
4. 执行 `prisma migrate deploy`。
5. 启动 `api` / `web` / `nginx`。
6. 执行健康检查。
7. 将当前 release 元数据写入 `deploy/.state/current.env`。

强制重建镜像时：

```bash
FORCE_REBUILD=yes bash scripts/deploy/staging-up.sh
```

说明：

- 运行态容器直接使用 `node_modules/.bin`，不依赖在线下载 `pnpm`。
- 同一 tag 的重复部署默认优先复用本地镜像，降低 Docker Hub 抖动对预发布环境的影响。
- 正式 staging / VPS 发版建议在干净工作树上执行；若同一 commit 需要多次构建不同候选版本，请显式设置新的 `IMAGE_TAG`，避免 `current.env` 和 `previous.env` 指向同一 tag。

## 分离 migrate / seed

只执行迁移：

```bash
bash scripts/deploy/migrate.sh
```

只执行种子：

```bash
bash scripts/deploy/seed.sh
```

## 健康检查

```bash
bash scripts/deploy/health-check.sh
```

检查内容：

- Compose 服务状态
- `postgres` / `redis` / `api` / `web` / `nginx` 健康状态
- `http://127.0.0.1:8080/`
- `http://127.0.0.1:8080/login`
- `http://127.0.0.1:8080/api/health`
- `http://127.0.0.1:3101/api/health`

## 日志查看

```bash
bash scripts/deploy/staging-log-tail.sh
bash scripts/deploy/staging-log-tail.sh api
bash scripts/deploy/staging-log-tail.sh nginx web
```

## 回滚

检查回滚前提：

```bash
bash scripts/deploy/rollback-check.sh
```

执行回滚：

```bash
bash scripts/deploy/staging-rollback.sh
```

回滚机制说明：

- `staging-up.sh` 成功后会把旧版本 release 状态移动到 `deploy/.state/previous.env`
- `staging-rollback.sh` 使用 `previous.env` 中记录的镜像 tag 重启 `api` / `web` / `nginx`
- 回滚完成后会交换 `current.env` 与 `previous.env`

## 直接手工命令

```bash
docker build -t feishu-timeline-api:local -f apps/api/Dockerfile .
docker build -t feishu-timeline-web:local -f apps/web/Dockerfile .
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml up -d postgres redis
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml run --rm api-migrate
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml up -d api web nginx
```

## 推荐 VPS 部署方式

当前仓库已经存在 `deploy/systemd` 和 `scripts/deploy/gce-*` 的主机部署资产，但 R09 新增的 staging 方式建议优先采用：

1. VPS 上安装 Docker / Compose
2. 使用 `deploy/compose.staging.yml` 启动完整栈
3. 通过 Nginx 容器统一暴露 `/` 与 `/api`
4. 通过 `staging-up.sh` / `health-check.sh` / `staging-rollback.sh` 管理发版

这样可以在 R10 之前先把“可部署、可回滚、可巡检”的底座固定下来，再决定是否继续复用宿主机 Nginx/systemd 或转向生产 Compose 编排。
