# TypeScript 项目部署与验收

## 本地与生产区别

本地 `pnpm dev` 由 Vite 提供前端并把 `/api` 转发给 API，使用 HTTP Cookie。
生产环境是一个应用容器加一个 PostgreSQL 容器：应用镜像里的 Express 同时提供 `/api` 和构建好的 React 页面（`APP_WEB_DIR=/app/web`），`/admin/users` 这类前端路由的地址都返回 `index.html`。HTTPS 由站长自己的反向代理负责（Nginx、Caddy、1Panel、宝塔等），反向代理把请求转发到本机 `127.0.0.1:3001`。
Cookie 自动 `Secure`，写操作 Origin 必须匹配 `APP_ORIGIN`（`https://<APP_DOMAIN>`）。
接口文档 `/api/docs` 只在非生产模式启用。
应用给所有响应加 HSTS、内容安全策略（CSP）、`X-Frame-Options: DENY` 等安全响应头，定义在 `apps/api/src/http/security-headers.ts`，反向代理不需要再加。脚本和 API 连接从站点自身载入，构建产物可内嵌字体，动态组件可使用内联样式。`/assets/` 下带哈希的文件缓存一年，其他页面每次重新校验。

限流和邮件队列共享 PostgreSQL，当前无 Redis/BullMQ 依赖。
任务量较大时可独立 worker，但不需要为了部署基础版本先搭一套微服务。

## 构建与启动

需要 Docker Engine + Compose v2、一个能签 HTTPS 证书的反向代理，以及指向服务器的域名。

```bash
cp ops/.env.example ops/.env
# 填写 APP_DOMAIN 和 POSTGRES_PASSWORD
docker compose --env-file ops/.env -f compose.production.yaml config --quiet
docker compose --env-file ops/.env -f compose.production.yaml up -d --build
```

不想在服务器上构建，可以在 `ops/.env` 里写 `XBOARD_IMAGE=ghcr.io/qunqin24/xboard:1.2.3`，改用 `up -d --no-build --pull always` 启动，见 [发布与升级](releases.md#使用发布的镜像)。

数据库密码须为长随机 URL 安全字符串（例如 `openssl rand -hex 32`）。
数据库不映射宿主机端口。应用只映射到宿主机的 `127.0.0.1:3001`，外网访问必须经过反向代理。需要换地址或端口时，在 `ops/.env` 设置 `APP_BIND` 和 `APP_PORT`。

### 反向代理

反向代理负责证书、80 跳转 443，并把所有路径原样转发到 `127.0.0.1:3001`。宿主机上用 Caddy 时，这几行就够，证书由 Caddy 自动申请：

```caddyfile
panel.example.com {
	reverse_proxy 127.0.0.1:3001
}
```

Nginx 示例（证书路径换成自己的）：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name panel.example.com;
    ssl_certificate     /etc/ssl/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/panel.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

限流、登录记录和运维令牌的来源限制都按客户端 IP 计算，所以反向代理要在 `X-Forwarded-For` 里带上真实客户端地址。应用只信任来自 Docker 网络网关 `172.30.56.1` 的 `X-Forwarded-For`：经映射端口进来的连接都从这个地址到达容器。因此：

- 不要把 `APP_BIND` 设成 `0.0.0.0` 后直接对公网开放端口，否则任何人都能伪造 `X-Forwarded-For` 绕过限流。确实要让别的机器上的反向代理访问时，用防火墙只放行那台机器。
- 前面还有 CDN（例如 Cloudflare）时，先在反向代理里还原真实访客 IP（Nginx 的 `real_ip_header`、Caddy 的 `trusted_proxies`），再转发给应用。
- 反向代理本身跑在 Docker 里时，给它用 `network_mode: host`，照样转发到 `127.0.0.1:3001`。
- 修改了 `compose.production.yaml` 的子网时，在 `ops/.env` 里同步设置 `TRUSTED_PROXY` 为新的网关地址，不要设为 `true`。

部署后用 `curl -sI https://panel.example.com/` 确认响应里有 `content-security-policy` 和 `strict-transport-security`，并在浏览器里登录一次，确认写操作没有被 Origin 检查拦下。

迁移由一次性 `migrate` 容器先执行，成功后启动应用容器 `app`。
后台邮件 worker 与过期清理在应用进程内运行，支持多实例锁定领取。

### 首次安装

`ops/.env` 填写 `APP_DOMAIN` 和 `POSTGRES_PASSWORD`。Compose 从域名生成 `APP_ORIGIN`，并将 API 的应用数据卷挂载到 `/data`。

面板首次访问会进入 `/setup`。用 `docker compose --env-file ops/.env -f compose.production.yaml logs app` 查看 `setup.available` 事件里的安装码。用该码创建管理员后，安装接口关闭。

应急恢复管理员账户时，执行 `docker compose --env-file ops/.env -f compose.production.yaml exec app node dist/admin.js`，按提示输入邮箱和新密码。已有账户会被提升为管理员、更新密码并撤销原会话。

### 系统设置

在「系统设置 → 邮件 → 邮件服务」填写 SMTP 服务器、端口、TLS、发件人及可选凭据。保存后邮件队列使用新配置。先向自己的地址发送测试邮件，再到「邮件队列」确认投递结果。

在「系统设置 → 管理员通知 → 告警」保存 HTTPS webhook，点「发送测试告警」验证接收方。API 将 5xx、后台任务和备份失败摘要发送到这个地址。同类告警在每个实例内最多每分钟一次。用响应头 `X-Request-Id` 对照 JSON 请求日志定位问题。

把面板的 `https://<域名>/api/health` 配到外部监控，定期确认 HTTPS 请求返回 200。该接口还会检查 PostgreSQL。可用性告警的通知渠道设在外部监控中，确保 API 进程停机时仍能收到通知。

API 每分钟检查启用的后端节点。节点 5 分钟没有发起通过认证的请求时，发送 `node.offline`，字段包含节点 ID 和最后接触时间。启用的节点从创建起也有 5 分钟宽限期。中转条目由父节点处理。投递失败下次重试，节点恢复后再次离线会产生新通知。

### 应用密钥

应用密钥用来加密两步验证种子、后台保存的密码和密钥、支付网关凭据和提现收款信息。它保存在 `/data/secrets/app.key`，本地默认是 `apps/api/.data/secrets/app.key`。共享数据库的 API 实例须使用同一把密钥。管理后台的「导出应用密钥」要求密码和已启用的两步验证，导出会写审计。把密钥保存在独立安全的位置；自动备份也会把它加密打包。

API 只在启动时检查一次密钥：

- 全新安装（数据库里还没有加密数据）时自动生成密钥。
- 数据库里已有加密数据、但密钥文件不存在时，拒绝启动，日志事件为 `app_key.missing`。常见原因是恢复了数据库但没有恢复 `app.key`，或数据卷没有挂上。把备份里的 `app.key` 放回 `secrets/app.key`（权限 `0600`），再启动。
- 密钥文件存在、但不是这个数据库的密钥时，拒绝启动，日志事件为 `app_key.mismatch`。换回正确的密钥文件。
- 运行期间不会再生成密钥。

确认密钥已经永久丢失、也没有任何备份时，才运行重置脚本。它会关闭所有账户的两步验证，清空后台保存的密码和密钥（SMTP、告警 webhook、备份存储、人机验证、Telegram）、停用并清空支付网关凭据、把提现收款信息替换为提示文字，然后生成新密钥并写审计。此操作无法撤销：

```bash
docker compose --env-file ops/.env -f compose.production.yaml run --rm app node dist/reset-app-key.js --confirm
```

不带 `--confirm` 时只打印将要清除的内容。重置后重新在后台填写各项密钥，并通知开过两步验证的用户重新设置。

对于已有两步验证数据的开发站，在启动新版本前把原来的 `TOTP_ENCRYPTION_KEY` 写到 `app.key`，文件权限设为 `0600`。

### 加密备份

1. 用 `age-keygen -o xboard-backup.key` 在独立设备创建密钥。把 `age1...` 公钥填进面板，私钥留在管理员设备。
2. 在 Cloudflare 控制台的 **R2 object storage** 创建存储桶。创建只限该桶的 **Object Read & Write** API 令牌。
3. 进入存储桶 **Settings → Bucket lock**，分别为 `daily/`、`weekly/`、`monthly/` 添加 7、28、180 天锁定规则。在 **Object lifecycle rules** 为相同前缀设对应删除周期。如果在面板配置自定义前缀，规则也要包含它。
4. 为 `xboard-test/` 配置 1 天生命周期。测试对象要能自动清理，使用独立前缀。
5. 在「系统设置 → 备份」填写 Cloudflare 账户 ID、存储桶、访问密钥、公钥与北京时间。欧盟桶选择「欧盟」管辖区。点「测试连接」上传并读回一个小文件，点「立即备份」试跑并查看状态。

其他兼容 S3 的存储提供方可填写自定义 endpoint、region 及路径风格。AWS S3 可为上传身份仅授予备份路径的 `s3:PutObject`，并给测试路径另授予 `s3:GetObject`。配合支持的对象锁定、生命周期和管理员恢复凭据。面板不删除历史备份。

备份是 PostgreSQL 17 的 `pg_dump -Fc` 与应用密钥的 age 加密归档。系统在北京时间到了开始时间后每天执行一次，周日额外保留周备份，每月 1 日额外保留月备份。对象名带 UTC 时间和运行 ID。定时备份每天只尝试一次，失败时告警，不会当天自动重试，可在后台手动触发。备份在数据库事务之外执行，运行中的记录显示为「进行中」，超过 90 分钟仍未结束的记录会被标为失败并告警。备份不包含备份记录表本身，恢复后的站点备份记录为空。使用备份记录的压缩归档大小估算容量。每天分别保存 7、4、6 份时，可用单次大小乘约 17 估算常态占用，再加流量数据增长余量。

恢复时先停止目标 API，将对象下载到受控目录。在保有私钥的机器运行以下命令。把 `DATABASE_URL` 指向全新的目标库。

```bash
umask 077
mkdir xboard-restore
age --decrypt --identity xboard-backup.key --output xboard-restore/bundle.tar backup.tar.age
tar -C xboard-restore -xf xboard-restore/bundle.tar database.dump app.key
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$DATABASE_URL" xboard-restore/database.dump
```

以目标 API 的运行用户把 `app.key` 放到持久化数据卷的 `secrets/app.key`，权限 `0600`。运行 `prisma migrate deploy`，然后启动服务。核对用户、订单、节点和余额流水的条数、用户余额与流水金额总和，并验证登录及订阅链接。恢复演练用隔离环境，限制访问生产邮件、告警、对象存储等外部服务，防止恢复的后台任务向生产发请求。

[R2 存储桶锁定](https://developers.cloudflare.com/r2/buckets/bucket-locks/) · [R2 对象生命周期](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) · [R2 与 AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)

### 在线支付及佣金

在「系统设置 → 支付 → 支付网关」新增网关，填写名称、手续费和排序。易支付填商户号、密钥与 HTTPS 网关地址，支持经典 MD5 协议。Stripe 填 API 密钥和 webhook 签名密钥。在 Stripe 后台登记面板显示的 HTTPS webhook，订阅 `checkout.session.completed` 和 `checkout.session.async_payment_succeeded`。发布前用供应方测试模式验证成功回执、金额和回跳。[易支付协议示例](https://www.z-pay.cn/doc.html) · [Stripe Webhook](https://docs.stripe.com/webhooks)

用户在待支付订单的结算弹窗选择网关，手续费由下单会话锁定。回调会校验金额与签名。若订单已取消、超时或无法完成结算，支付本金会入余额。后台「最近支付回执」显示已结算、已入余额或待人工处理。达到余额上限的回执待人工核对，可在供应方后台处理退款。

在「佣金与提现」设置返佣比例、首单或每单及提现方式。用户在「邀请」查看佣金并申请提现。管理员查看加密保存的收款信息，完成线下打款后确认，或驳回并退回佣金。管理员仍可在线下核实收款后确认订单。

### 人机验证

在「系统设置 → 安全 → 人机验证」选择供应方，填站点公钥与验证密钥。所选供应方需允许面板域名。用 Turnstile 托管小组件、reCAPTCHA v2 复选框或 hCaptcha 小组件。注册保护同时覆盖发送注册验证码与提交注册，两次提交各用一个证明。[Turnstile](https://developers.cloudflare.com/turnstile/get-started/) · [reCAPTCHA](https://developers.google.com/recaptcha/docs/display) · [hCaptcha](https://docs.hcaptcha.com/)

### Telegram 及语言

从 BotFather 获取机器人令牌，将令牌填入「系统设置 → 管理员通知 → Telegram 机器人」。面板校验并为公网 HTTPS 域名登记 webhook。用户在账户设置中生成一次性链接并在私聊点击开始。命令 `/status` 显示流量与到期时间。管理员绑定后可接收新工单、新订单和离线通知。 [Telegram Bot API](https://core.telegram.org/bots/api)

「系统设置 → 站点 → 语言」配置访客默认语言，账户设置可保存个人偏好。「邮件队列 → 邮件模板」按语言编辑系统邮件。已有模板继续作为简体中文版本。手工群发使用管理员提供的正文。

## 日常操作

```bash
docker compose --env-file ops/.env -f compose.production.yaml logs --tail=100 app
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
- 已提供：Compose、Dockerfile、反向代理示例、GitHub Actions 检查和镜像构建流程。
- 尚未验证：一体化镜像的构建与容器启动（本地未运行 Docker，由 CI 的 PR 检查构建）、反向代理后的公网 HTTPS、
  真实邮件提供商、真实节点连接。

节点验收见 [typescript-nodes.md](typescript-nodes.md)。
只有完成目标部署环境的上述检查后，才可认定该环境可上线。
