# TypeScript 项目部署与验收

## 本地与生产区别

本地 `pnpm dev` 使用 Vite 代理及 HTTP Cookie。
生产候选使用 Caddy HTTPS、静态 React 产物、Express、PostgreSQL；
Cookie 自动 `Secure`，写操作 Origin 必须匹配 `APP_ORIGIN`。
接口文档 `/api/docs` 只在非生产模式启用。
Caddy 返回 HSTS 与内容安全策略。脚本和 API 连接从站点自身载入，构建产物可内嵌字体，动态组件可使用内联样式。

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

### 日志与告警

API 以 JSON 输出请求与任务事件。用响应头 `X-Request-Id` 定位对应请求。日志使用路由模板，
省略请求正文、Cookie、URL 参数和原始错误消息。
在 `ops/.env` 设置 `ALERT_WEBHOOK_URL` 并重新创建 API 容器后，API 会将 5xx 和任务失败摘要 POST
到对应 HTTPS 接收端。同类错误在每个 API 实例内最多每分钟通知一次。

### 两步验证

`TOTP_ENCRYPTION_KEY` 是启用两步验证的前提：它加密保存用户的 TOTP 密钥。
未配置（或格式不对）时，用户仍可用密码登录，但“启用两步验证”返回配置提示。

生成方法：32 个随机字节的 Base64URL 编码，共 43 个字符。

```bash
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
```

写入 `ops/.env`（本地为 `apps/api/.env`）的 `TOTP_ENCRYPTION_KEY`，并在密钥管理器中另存一份。
所有 API 实例使用同一值，升级、重启及恢复数据库时保持不变。

更换或丢失密钥后，已启用两步验证的用户无法再通过动态验证码验证，因为旧密钥解不开已保存的 TOTP 密钥。
未使用的恢复码仍可登录（恢复码只保存摘要，与此密钥无关）。登录后用户需关闭并重新设置两步验证。
没有恢复码的用户由管理员在“用户详情 → 账户安全”点“重置两步验证”，该操作会移除其两步验证并使登录会话失效，写入审计。
管理员账户不能通过该接口重置，请保管好管理员的恢复码。

用户在账户设置的“安全”页扫描二维码（或手动输入密钥）启用。动态验证码错误会被限制：
每个用户连续错 5 次锁定 15 分钟，一天内累计 15 次锁定 24 小时。关闭两步验证和重新生成恢复码适用同一限制，
与密码错误计数分开。

### 外部支付

按当前产品决定不接外部支付，不需要支付密钥，没有支付回调接口。
管理员核实线下收款后，可在「订单」中对仍有效的待支付订单选择「确认线下收款」。凭证号和备注可选填。
余额入账仍可在用户详情中登记，供用户后续购买时使用。
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

### 升级计费迁移（20261118070000_billing）前

该迁移新增 CHECK 约束，旧数据不满足时迁移会在开头报错并整体回滚，不会改动任何数据。
错误信息写明表名、违规行数和建议的处理方式。先备份，再在生产库上运行下列检查（应全部返回 0）：

```sql
SELECT count(*) FROM "PlanPrice" WHERE "amountMinor" <= 0;
SELECT count(*) FROM "User" WHERE "balance" < 0;
SELECT count(*) FROM "User" WHERE "transferEnable" < 0 OR "upload" < 0 OR "download" < 0;
SELECT count(*) FROM "Plan" WHERE "transferEnable" <= 0;
SELECT count(*) FROM "TrafficRecord" WHERE "upload" < 0 OR "download" < 0;
SELECT count(*) FROM "Order" WHERE "amountMinor" < 0 OR "durationDays" <= 0 OR "transferBytes" <= 0;
```

处理方式（涉及金额的数据由运营人员确认，迁移不会自动改写）：

- `PlanPrice` 金额为 0：旧版本允许零价。逐条确认后改为正数价格，或删除该价格行（含已下架及软删除的套餐）。
  `UPDATE "PlanPrice" SET "amountMinor" = <正整数分> WHERE id = <id>;`
- `User.balance` 为负：对照余额流水 `BalanceEntry` 查清原因，再通过后台入账或人工修正，并留审计。
- `User` 流量字段为负：`UPDATE "User" SET "transferEnable" = GREATEST("transferEnable", 0), "upload" = GREATEST("upload", 0), "download" = GREATEST("download", 0) WHERE "transferEnable" < 0 OR "upload" < 0 OR "download" < 0;`
- `Plan.transferEnable` 不为正：为每个套餐（含软删除）设置正数额度；无任何引用的套餐可删除。
- `TrafficRecord` 为负：仅为用量历史，可 `DELETE FROM "TrafficRecord" WHERE "upload" < 0 OR "download" < 0;`。
- `Order` 快照无效：逐条查看。已付款订单不要删除，应修正快照字段或交运营核对。

迁移文件不含 `BEGIN/COMMIT`，由 Prisma 作为一次多语句事务执行，因此失败时能直接看到上述报错。
修复后若 `prisma migrate deploy` 提示迁移处于失败状态，先执行
`prisma migrate resolve --rolled-back 20261118070000_billing`，再重新部署。

流量主键改为 64 位时 PostgreSQL 会重写 `TrafficRecord` 并锁表，大表应安排维护窗口。

## 验收状态

- 已运行：PostgreSQL 迁移、本地 API 集成测试、SMTP 协议测试、TypeScript 检查、前端构建。
- 已提供：Compose、Dockerfile、Caddy 配置、CI 检查流程。
- 尚未验证：镜像构建与容器启动（当前机器 Docker daemon 未运行）、公网 HTTPS、
  真实邮件提供商、真实节点连接。

节点验收见 [typescript-nodes.md](typescript-nodes.md)。
只有完成目标部署环境的上述检查后，才可认定该环境可上线。
