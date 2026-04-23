# GCE Step 5 Domain And HTTPS

更新时间：2026-04-09

本文件对应“正式域名接入、80/443 放通、HTTPS 证书、DNS 切换建议和外网验证”的第 5 步。

## 范围

第 4 步已经打通：

- GCE Ubuntu VM
- `feishu-timeline-api` / `feishu-timeline-web`
- `timeline.all-too-well.com` 的 HTTP 反代

第 5 步继续处理：

- 公网 IP 稳定性
- GCP 防火墙与实例标签
- 根域名 `all-too-well.com` / `www.all-too-well.com` 的占位站点
- Certbot 前置条件与 HTTPS 签发
- DNS 切换建议

## 关键边界

1. 当前项目仍然正式部署在 `timeline.all-too-well.com`
2. `all-too-well.com` 与 `www.all-too-well.com` 只作为根域名占位入口，不反代到本项目
3. 在没有确认 DNS 已切向这台 GCE、且没有可用 Certbot 邮箱前，不强行签发新证书
4. SSH 22 端口现状只读取与记录，不在本轮激进收紧，避免把自己锁在门外

## 新增脚本

- [`gce-network-and-https.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-network-and-https.sh)
- [`gce-domain-verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-domain-verify.sh)

## 使用顺序

1. 在本地执行网络与 Nginx 收口：

```bash
bash scripts/deploy/gce-network-and-https.sh
```

2. 如果 DNS 已切到当前实例、且你已经准备好 Certbot 邮箱，再执行：

```bash
CERTBOT_EMAIL='you@example.com' bash scripts/deploy/gce-network-and-https.sh
```

3. 在本地执行域名与 HTTPS 验证：

```bash
bash scripts/deploy/gce-domain-verify.sh
```

## 这轮脚本会做什么

`gce-network-and-https.sh` 会：

1. 读取实例当前公网 IP、network、network tier、tags
2. 如果公网 IP 还是临时 IP，则优先把当前 IP 直接保留为静态 IP
3. 校验 `http-server` / `https-server` 标签与 80/443 防火墙规则
4. 在远端落地两个 Nginx 站点：
   - `feishu-timeline`：只处理 `timeline.all-too-well.com`
   - `all-too-well-root`：只处理 `all-too-well.com` / `www.all-too-well.com`
5. 移除 Debian 默认站点的 `sites-enabled/default` 软链，避免根域名继续落到系统默认页
6. 本机带 `Host` 头验证根域名与 timeline 子域名
7. 仅在证书前提满足时，才安装或执行 Certbot

## 证书签发前提

脚本默认采用保守判定。只有在满足以下条件时，才会自动尝试签发：

1. 公共 DNS 已经能把 `all-too-well.com` 和 `www.all-too-well.com` 解析到当前实例公网 IP
2. 或者你显式设置了 `FORCE_CERTBOT=yes`
3. 有可用的 Certbot account，或者提供了 `CERTBOT_EMAIL`

如果以上条件不满足，脚本会停止在“已经完成网络与 Nginx 收口，但跳过证书签发”的状态，并输出阻塞原因。

## 当前建议的 DNS 目标

本轮推荐的最终 DNS 结构：

- `@`：
  - A 记录到当前 GCE 静态公网 IP
- `www`：
  - CNAME 到 `all-too-well.com`
- `timeline`：
  - A 记录到同一台 GCE 静态公网 IP

如果仍通过 Cloudflare 管理：

1. 先使用 `DNS only` 验证源站
2. HTTPS 和源站行为稳定后，再评估是否改回 `Proxied`

## 远端路径

- 应用代码：`/opt/feishu_timeline_app`
- timeline Nginx：`/etc/nginx/sites-available/feishu-timeline`
- root placeholder Nginx：`/etc/nginx/sites-available/all-too-well-root`
- 根域名占位页：`/var/www/all-too-well-placeholder/index.html`

## 本轮实测结果

- GCE 当前公网 IP：`35.212.246.199`
- 已保留为静态 IP：`all-too-well-us-west1-ip`
- 实例现有标签：`http-server`、`https-server`
- 当前生效的 Web 防火墙规则：
  - `default-allow-http`
  - `default-allow-https`
- 已关闭 Nginx 默认站点软链：`/etc/nginx/sites-enabled/default`
- 已启用两个站点：
  - `feishu-timeline`
  - `all-too-well-root`
- 远端本机验证结果：
  - `Host: all-too-well.com` -> `200 OK` 占位页
  - `Host: www.all-too-well.com` -> `301` 回根域名
  - `Host: timeline.all-too-well.com` -> `307 /dashboard`
- 公共 DNS 现状：
  - `all-too-well.com` / `www.all-too-well.com` 仍经 Cloudflare 返回公网代理地址
  - `timeline.all-too-well.com` 当前还没有公共 A 记录
- 证书现状：
  - 远端尚未安装或签发新的 Certbot 证书
  - 由于公共 DNS 还未直接切到 `35.212.246.199`，本轮脚本保守跳过证书签发

## 已知限制

1. 当前公网 DNS 仍可能停留在 Cloudflare 旧链路，导致外网请求还未命中新 GCE
2. 当前还没有确认可用的 Certbot 邮箱
3. 如果根域名仍经过 Cloudflare orange-cloud 代理，公共 A 记录不会直接显示源站 IP；这时脚本会保守地拒绝自动签证书
