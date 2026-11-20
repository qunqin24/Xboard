# Xboard TypeScript

[English](README.en.md)

独立的订阅管理系统，使用 React、Express、Prisma 和 PostgreSQL。
当前工作区仅保留新项目，旧 PHP 实现可通过 Git 历史查阅。

## 本地启动

需要 Node.js 22.12+（建议 24）、pnpm 11 和 PostgreSQL。

```bash
pnpm install
docker compose -f compose.typescript.yaml up -d
cp -n .env.example .env
pnpm db:setup
pnpm dev
```

`pnpm dev` 同时启动前后端；也可以分开启动：`pnpm api`（后端，端口 3001）和 `pnpm web`（前端，端口 5173，`/api` 转发到 3001）。后端启动前会自动重新生成 Prisma Client；拉到新的数据库迁移后仍需运行 `pnpm db:setup`。

已有根目录 `.env` 时请保留原配置。使用本机 PostgreSQL 时可跳过 Docker，
将 `DATABASE_URL` 指向该数据库。

- 用户端：http://127.0.0.1:5173
- 管理后台：http://127.0.0.1:5173/admin
- 开发 API 文档：http://127.0.0.1:3001/api/docs

## 功能

账户与邮件验证、套餐订单、余额支付、订阅生成、节点用量上报、公告工单、
管理员手动入账、套餐与节点管理、审计记录和邮件队列。
在线支付可启用易支付或 Stripe。支持邀请佣金、提现审核、Telegram 通知、三种人机验证和中英双语。节点支持 UniProxy 和 XrayR 旧 V2board 接口。

![管理后台仪表盘](docs/images/overview.png)

## 部署

用 GitHub 上发布的镜像部署，服务器上不需要源码，也不用构建。

准备：

- 一台 Linux 服务器（amd64 或 arm64），装好 Docker Engine 和 Compose v2。
- 一个解析到这台服务器的域名。
- 一个负责 HTTPS 的反向代理，例如 Caddy、Nginx、1Panel 或宝塔。

**1. 下载部署文件**

```bash
mkdir -p xboard/ops && cd xboard
curl -fsSLo compose.production.yaml https://raw.githubusercontent.com/qunqin24/Xboard/v1.0.0/compose.production.yaml
curl -fsSLo ops/.env https://raw.githubusercontent.com/qunqin24/Xboard/v1.0.0/ops/.env.example
```

**2. 填写 `ops/.env`**

```bash
APP_DOMAIN=panel.example.com
POSTGRES_PASSWORD=换成你自己的长随机密码
XBOARD_IMAGE=ghcr.io/qunqin24/xboard:1.0.0
```

数据库密码可以用 `openssl rand -hex 32` 生成。`XBOARD_IMAGE` 写完整版本号，不要用 `latest` 或 `edge`，这样升级的时机由你决定。`.env` 里的其他项都可以不填。

**3. 启动**

```bash
docker compose --env-file ops/.env -f compose.production.yaml up -d --no-build --pull always
```

会起两个容器：应用和 PostgreSQL。启动前会先自动执行数据库迁移。应用只监听本机 `127.0.0.1:3001`，不直接对外。

**4. 配置反向代理**

把域名的所有请求转发到 `127.0.0.1:3001`。用 Caddy 时，下面三行就够了，证书会自动申请：

```caddyfile
panel.example.com {
	reverse_proxy 127.0.0.1:3001
}
```

Nginx 的配置、CDN 后面怎么取真实 IP，见 [部署说明](docs/typescript-deployment.md#反向代理)。

**5. 创建管理员**

打开 `https://你的域名/setup`。安装码在应用日志里，查 `setup.available` 这一行：

```bash
docker compose --env-file ops/.env -f compose.production.yaml logs app | grep setup.available
```

建好管理员后，安装页面会自动关闭。邮件、备份、告警、支付都在后台“系统设置”里配置。

### 升级

后台“系统设置 → 关于”会显示当前版本。有新版本时，仪表盘顶部也会出现提示。升级步骤：

1. 备份数据库和应用密钥，方法见 [发布与升级](docs/releases.md#升级与回退)。
2. 读一遍新版本 Release 里的说明。
3. 把 `ops/.env` 里的 `XBOARD_IMAGE` 改成新版本号。
4. 再执行一次第 3 步的启动命令。

### 从源码构建

需要改代码，或者服务器拉不到 GHCR 镜像时，可以在服务器上自己构建：

```bash
git clone https://github.com/qunqin24/Xboard.git && cd Xboard
cp ops/.env.example ops/.env   # 填 APP_DOMAIN 和 POSTGRES_PASSWORD，不写 XBOARD_IMAGE
docker compose --env-file ops/.env -f compose.production.yaml up -d --build
```

### 发布新版本

先在 `CHANGELOG.md` 写好新版本的条目，然后在 `main` 上打 `v1.2.3` 这样的标签并推送。GitHub Actions 会跑完整检查，推送 amd64 和 arm64 镜像，并创建 GitHub Release。详见 [发布与升级](docs/releases.md#发布新版本)。

## 目录与文档

| 路径 | 用途 |
| --- | --- |
| `apps/api` | API、数据库迁移及后端测试 |
| `apps/user` | 用户中心和管理后台，界面基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) |
| `packages/contracts` | 前后端共用的接口定义（zod），并由此生成 OpenAPI 文档 |
| `ops` | 生产环境变量示例 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 功能、业务规则、管理员初始化和开发说明 |
| [节点接入](docs/typescript-nodes.md) | 支持范围、配置及验证边界 |
| [部署说明](docs/typescript-deployment.md) | Docker、反向代理与 HTTPS、邮件与备份 |
| [运维 API](docs/ops-api.md) | 接入自动化管理 |
| [贡献指南](CONTRIBUTING.md) | 开发、测试与提交 |
| [安全报告](SECURITY.md) | 私下报告漏洞 |

```bash
pnpm api:generate
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

每个 PR 和 `main` 上的提交都会在 GitHub Actions 里跑同样的检查，并试构建镜像。

真实节点、生产 SMTP 和公网 HTTPS 仍需在目标环境验收。

## 来源与许可证

以 [Xboard](https://github.com/cedar2025/Xboard) 为功能参考重写，
前端界面改编自 [shadcn-admin](https://github.com/satnaing/shadcn-admin)（MIT，
许可证见 `apps/user/LICENSE.shadcn-admin`）。
保留原仓库 Git 历史及 [MIT 许可证](LICENSE)。
TypeScript 版采用新的数据库结构。旧 PHP 站点的数据需要单独迁移，保留原数据库副本，并在切换时轮换节点密钥。
