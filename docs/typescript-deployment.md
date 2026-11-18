# TypeScript 项目部署与验收

## 本地与生产区别

本地 `pnpm dev` 使用 Vite 代理及 HTTP Cookie。
生产候选使用 Caddy HTTPS、静态 React 产物、Express、PostgreSQL；
Cookie 自动 `Secure`，写操作 Origin 必须匹配 `APP_ORIGIN`。
接口文档 `/api/docs` 只在非生产模式启用。

限流和邮件队列共享 PostgreSQL，当前无 Redis/BullMQ 依赖。
任务量较大时可独立 worker，但不需要为了部署基础版本先搭一套微服务。

## 构建与启动

Docker Engine + Compose v2，域名 DNS 指向服务器，开放 80/443。

```bash
cp ops/.env.example ops/.env
# 修改域名、HTTPS origin、数据库密码和可选 SMTP
docker compose --env-file ops/.env -f compose.production.yaml config --quiet
docker compose --env-file ops/.env -f compose.production.yaml build
docker compose --env-file ops/.env -f compose.production.yaml up -d
```

数据库密码须为长随机 URL 安全字符串（例如 `openssl rand -hex 32`）。
API 与数据库不映射宿主机端口。Caddy 以固定容器 IP 被 API 信任，避免任意请求伪造
`X-Forwarded-For` 绕过限流。若修改网络子网，同步调整 `TRUSTED_PROXY`，不要配置为 `true`。

迁移由一次性 `migrate` 容器先执行，成功后启动 API，API 健康后启动 Web。
后台邮件 worker 与过期清理在 API 进程内运行，支持多实例锁定领取。

### 创建管理员

```bash
docker compose --env-file ops/.env -f compose.production.yaml exec \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD='替换为强密码' \
  api node dist/admin.js
```

`ADMIN_EMAIL` 是已注册的账户时，命令会把它提升为管理员，同时把密码改为 `ADMIN_PASSWORD`、
退出该账户的所有会话并标记邮箱已验证，所以两个变量都必须提供。访问 `/admin` 后配置套餐、节点、公告等。

### SMTP

没有 SMTP 时邮件操作显示明确错误。配置 `SMTP_HOST/PORT/SECURE/USER/PASSWORD` 和
`MAIL_FROM` 后重新创建 API 容器。通过后台“邮件队列”检查发送结果，
并实际完成一次找回密码与邮箱验证。测试 SMTP 投递不代表真实域名的 SPF/DKIM 或收件率已验证。

### 外部支付

按当前产品决定不接外部支付，不需要支付密钥，没有支付回调接口。
管理员核实线下收款后手动入账，填写凭证或原因；用户用余额支付。
不要把示例账户余额或测试数据导入生产。

## 日常操作

```bash
docker compose --env-file ops/.env -f compose.production.yaml logs --tail=100 api
docker compose --env-file ops/.env -f compose.production.yaml ps
docker compose --env-file ops/.env -f compose.production.yaml exec -T postgres \
  pg_dump -U xboard -Fc xboard > xboard-backup.dump
```

备份含私密数据，放在受控位置，勿提交仓库。恢复操作先在独立数据库演练。
升级先备份，重新构建镜像并执行 Compose；数据库迁移只前向执行，回退代码前确认表结构兼容，
不能直接覆盖数据卷。

## 验收状态

- 已运行：PostgreSQL 迁移、本地 API 集成测试、SMTP 协议测试、TypeScript 检查、前端构建。
- 已提供：Compose、Dockerfile、Caddy 配置、CI 检查流程。
- 尚未验证：镜像构建与容器启动（当前机器 Docker daemon 未运行）、公网 HTTPS、
  真实邮件提供商、真实节点连接。

节点验收见 [typescript-nodes.md](typescript-nodes.md)。
只有完成目标部署环境的上述检查后，才可认定该环境可上线。
