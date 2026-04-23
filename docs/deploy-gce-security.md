# GCE Security Hardening

更新时间：2026-04-09

本文件记录 `feishu_timeline_app` 在 GCE 上线后的服务器侧安全加固口径。目标是收紧暴露面，但不破坏 `https://timeline.all-too-well.com` 的飞书登录链路。

## 已自动收口的项目

- Nginx TLS 口径
  - 统一禁用 `TLSv1` / `TLSv1.1`
  - 保留 `TLSv1.2` / `TLSv1.3`
  - `server_tokens off`
  - `ssl_session_tickets off`
- Nginx 安全头
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `proxy_hide_header X-Powered-By`
- SSH
  - `PermitRootLogin no`
  - `PasswordAuthentication no`
  - `KbdInteractiveAuthentication no`
  - `PubkeyAuthentication yes`
  - `MaxAuthTries 3`
  - `LoginGraceTime 30`
  - `X11Forwarding no`
  - `AllowAgentForwarding no`
- Fail2ban
  - 启用 `sshd` jail
  - `backend=systemd`
  - `maxretry=5`
  - `findtime=10m`
  - `bantime=1h`
- systemd 沙箱
  - `PrivateDevices=true`
  - `ProtectControlGroups=true`
  - `ProtectKernelModules=true`
  - `ProtectKernelTunables=true`
  - `ProtectHostname=true`
  - `ProtectSystem=full`
  - `RestrictSUIDSGID=true`
  - `RestrictNamespaces=true`
  - `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`
  - `LockPersonality=true`

## 明确保留不动的项目

- GCP `default-allow-ssh`
  - 当前仍对 `0.0.0.0/0` 开放
  - 这是当前剩余最大的外层风险
  - 本轮没有自动收紧，原因是缺少稳定可信的管理员固定出口 IP，直接改有把自己锁在门外的风险
- Cloudflare 代理状态
  - 不在本文件内自动切换
  - 避免影响飞书 OAuth 回调、Cookie、源站 TLS

## 当前监听面

- `0.0.0.0:80` / `0.0.0.0:443`
  - Nginx
- `0.0.0.0:22`
  - OpenSSH
- `127.0.0.1:3000`
  - Next.js Web
- `127.0.0.1:3001`
  - NestJS API
- `127.0.0.1:5432`
  - PostgreSQL
- `127.0.0.1:6379`
  - Redis

结论：

- 应用、数据库、缓存都没有直接暴露到公网
- 当前公网入口只应是 Nginx 的 80/443

## 执行命令

应用线上安全硬化：

```bash
bash scripts/deploy/gce-security-hardening.sh
```

带重发版一起跑：

```bash
RUN_SECURITY_HARDENING=yes bash scripts/deploy/gce-redeploy.sh
```

正式验收：

```bash
bash scripts/deploy/gce-production-acceptance.sh
bash scripts/deploy/gce-release-verify.sh
```

查看日志：

```bash
bash scripts/deploy/gce-log-tail.sh TARGET=api
bash scripts/deploy/gce-log-tail.sh TARGET=web
bash scripts/deploy/gce-log-tail.sh TARGET=nginx
```

## 上线后人工建议

1. 把 GCP 的 SSH 防火墙从 `0.0.0.0/0` 收紧到固定办公出口 IP 或 IAP。
2. 在维护窗口内完成剩余系统包升级，尤其是当前待升级的 `systemd` 相关包。
3. 如果未来要把 `timeline` 切到 Cloudflare `Proxied`，先复测飞书登录、Cookie 和 `/login/callback`。
