# Xboard TypeScript

独立的 React + Express + PostgreSQL 订阅管理项目。原 PHP 实现已从工作区移除，
可通过 Git 历史查阅；新应用不运行 PHP、不读取旧配置或迁移旧数据库。

## 功能入口

| 入口 | 功能 |
| --- | --- |
| `/sign-in`、`/sign-up`、`/forgot-password` | 登录、注册（可在系统设置中关闭）、找回密码；旧地址 `/login` 会跳转到 `/sign-in` |
| `/recover` | 邮件链接落地页：`#verify:` 验证邮箱，`#reset:` 设置新密码 |
| `/` | 用户中心总览：流量用量、套餐、余额、公告 |
| `/plans`、`/orders` | 选购套餐、创建订单；订单列表中用余额支付或取消 |
| `/subscription` | 生成订阅链接（会使旧链接失效） |
| `/records`、`/tickets` | 余额流水与流量记录；工单 |
| `/settings/*` | 账户与邮箱验证、修改密码、外观 |
| `/admin/*` | 管理后台（侧边栏切换）：仪表盘、`plans` 套餐、`nodes` 节点、`users` 用户（编辑订阅、入账、清零流量、重置密码、封禁）、`orders` 订单、`ledger` 余额流水、`notices` 公告、`tickets` 工单、`audit` 审计、`mail` 邮件队列、`settings` 系统设置 |
| `/api/docs` | 开发环境接口文档 |

按用户选择，**外部支付和在线充值关闭**。管理员可手动入账，所有入账有请求去重、
原因记录和审计。普通用户无法自行修改余额。没有隐藏的测试支付成功接口。

## 本地启动

需要 Node.js 22.12+（建议 24 LTS）、pnpm 11、PostgreSQL。

```bash
pnpm install
docker compose -f compose.typescript.yaml up -d
cp apps/api/.env.example apps/api/.env
pnpm db:setup
pnpm dev
```

已有 `.env` 时不要覆盖，确认它指向新项目数据库。
打开 http://127.0.0.1:5173，自行注册。

本机 PostgreSQL 也可使用，配置 `DATABASE_URL` 即可。本次开发使用本机独立集群
`apps/api/.data/postgres`，端口 55432，与 Docker 方式二选一。

### 管理员

在 `apps/api/.env` 设置 `ADMIN_EMAIL`，然后运行：

```bash
pnpm --filter @xboard/api admin:create
```

邮箱已存在时只提升角色、不改密码；不存在时需同时设置 `ADMIN_PASSWORD`（12–128 字符）。
CLI 提升角色也写审计。此操作不对外暴露 HTTP 接口。

当前本地 `developer@example.test` 已设为管理员，原开发密码仍是
`apps/api/.env` 中的 `DEMO_PASSWORD`。

可选示例数据：设置 `DEMO_PASSWORD` 后执行 `pnpm db:seed`。已有账户不会重置。
示例数据没有真实节点。

### 邮件

本地 Mailpit 在 http://127.0.0.1:8025，SMTP 端口 1025：

```bash
docker compose -f compose.typescript.yaml up -d mailpit
```

设置 `SMTP_HOST=127.0.0.1`、`SMTP_PORT=1025` 后重启 API。
真实 SMTP 另配置 `SMTP_USER`、`SMTP_PASSWORD`、`SMTP_SECURE` 和 `MAIL_FROM`。
不配置 SMTP 时接口明确返回“尚未配置”，不会声称已发信。

邮件持久化入队，后台每 5 秒领取任务；发送失败指数退避，最多 5 次。
后台邮件队列可查看状态。成功发送后清空正文；邮件记录保留 7 天。
投递语义为至少一次，SMTP 接收成功后断线可能导致重复邮件，链接仍只能使用一次。

## 数据与业务规则

- 金额存整数分，当前币种 CNY；流量存 BigInt 字节，接口用十进制字符串。
- 密码使用加盐 scrypt；服务端会话保存令牌 SHA-256，8 小时有效。
- 改密、重置密码、封禁会撤销登录。验证/重置链接 30 分钟有效、单次使用。
- 套餐草稿不销售，发布后可下单；一个套餐每个周期只有一个价格。
- 订单保存价格、名称、流量、限速、设备数与周期快照。
- 每个账户最多一笔有效待支付订单，30 分钟超时。相同请求 UUID 重试不重复下单。
- 余额扣款、权益开通、扣款流水在同一事务中。按用户锁行，防止并发重复扣款。
- 月付 30 天、季付 90 天、年付 365 天。流量是整个周期总额度，不按月重置。
- 有效期内同套餐续费叠加时间与流量；到期重购重新计算期限并清零已用量。
  有效期内暂不支持换套餐、退款或按比例折算。
- 流量清零由管理员操作并记录原因；到期权益由节点用户过滤实时判断。
- 节点仅获取关联套餐的有效、未封禁且流量未耗尽用户。
- 订阅令牌与代理 UUID 独立；重置订阅链接撤销旧下载链接，但不更换已导入客户端的 UUID。

## 节点和订阅

已实现两类接口：

- UniProxy：V2bX 以及使用相同面板协议的后端。
- Deepbwork / TrojanTidalab / ShadowsocksTidalab：XrayR 旧 V2board 适配器。

支持 TCP + TLS VMess/VLESS/Trojan、传统 AEAD Shadowsocks、Hysteria2、TUIC。
提供 Mihomo 与 Sing-box JSON 订阅（JSON 也是合法 YAML）。
不支持 Reality、WebSocket、gRPC、SS2022、Hysteria1 或任意版本自动适配。

接入步骤、源码对照、测试边界和上报重试语义见 [docs/typescript-nodes.md](docs/typescript-nodes.md)。

## 工程与运行

```text
apps/api/              Express API、持久化邮件队列、定时维护、Prisma 迁移
apps/user/             React 用户中心和管理后台（基于 shadcn-admin，文件路由）
packages/contracts/    前后端共用的 zod 接口定义，生成 /api/docs 的 OpenAPI
ops/                   HTTPS 反向代理与部署环境示例
compose.typescript.yaml 本地 PostgreSQL、Mailpit
compose.production.yaml 生产候选部署配置
```

模块化单体。限流共享 PostgreSQL 存储，支持多实例；邮件任务用行锁领取。
定时维护清理过期会话、邮件令牌、在线记录和限流状态，取消超时订单，
并删除 180 天前的流量记录（统计最多回看 180 天）。每项清理独立执行，失败只记日志。
余额流水和审计记录不自动删除；大规模部署需根据留存需求归档。
后台的用户、订单、余额流水、审计四个列表为服务端分页和搜索；其余列表限制最近 100/200 条。

限流：每个接口按 IP 每分钟 120 次（IPv6 按 /64 计）；登录每 IP 每分钟 5 次，
同一邮箱 15 分钟内失败 10 次后锁定 15 分钟；注册、找回密码每 IP 每分钟 3 次，
找回密码同一邮箱每小时 5 次，且 60 秒内重复请求不再发信，之前的链接仍然有效。

## 检查与部署

```bash
pnpm api:generate
pnpm typecheck
pnpm test
pnpm build
```

集成测试使用随机 PostgreSQL schema，不删除开发数据库；覆盖权限、并发入账/支付、
节点鉴权与用量、订阅撤销、工单隔离、邮件链接及真实 SMTP 协议投递、邮件失败重试、
限流、分页、2038 年之后的到期时间，以及后台读接口与 contracts 的结构一致性。
GitHub Actions 运行同一流程。部署步骤见 [docs/typescript-deployment.md](docs/typescript-deployment.md)。

当前完成的是应用实现及本地测试。真实节点联网、用户提供的 SMTP、容器镜像和公网 TLS
需要在对应环境验收，不能用接口测试替代这些结论。
