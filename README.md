# Xboard TypeScript

独立的订阅管理系统，使用 React、Express、Prisma 和 PostgreSQL。
当前工作区仅保留新项目，旧 PHP 实现可通过 Git 历史查阅。

## 本地启动

需要 Node.js 22.12+（建议 24）、pnpm 11 和 PostgreSQL。

```bash
pnpm install
docker compose -f compose.typescript.yaml up -d
cp apps/api/.env.example apps/api/.env
pnpm db:setup
pnpm dev
```

`pnpm dev` 同时启动前后端；也可以分开启动：`pnpm api`（后端，端口 3001）和 `pnpm web`（前端，端口 5173，`/api` 转发到 3001）。

已有 `apps/api/.env` 时请保留原配置。使用本机 PostgreSQL 时可跳过 Docker，
将 `DATABASE_URL` 指向该数据库。

- 用户端：http://127.0.0.1:5173
- 管理后台：http://127.0.0.1:5173/admin
- 开发 API 文档：http://127.0.0.1:3001/api/docs

## 功能

账户与邮件验证、套餐订单、余额支付、订阅生成、节点用量上报、公告工单、
管理员手动入账、套餐与节点管理、审计记录和邮件队列。
外部支付当前关闭；节点支持 UniProxy 和 XrayR 旧 V2board 接口。

## 目录与文档

| 路径 | 用途 |
| --- | --- |
| `apps/api` | API、数据库迁移及后端测试 |
| `apps/user` | 用户中心和管理后台，界面基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) |
| `packages/contracts` | 前后端共用的接口定义（zod），并由此生成 OpenAPI 文档 |
| `ops` | 生产环境配置示例、Caddy 配置 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 功能、业务规则、管理员初始化和开发说明 |
| [节点接入](docs/typescript-nodes.md) | 支持范围、配置及验证边界 |
| [部署说明](docs/typescript-deployment.md) | Docker、HTTPS、邮件与备份 |

```bash
pnpm typecheck
pnpm test
pnpm build
```

真实节点、生产 SMTP、容器启动和公网 HTTPS 仍需在目标环境验收。

## 来源与许可证

以 [Xboard](https://github.com/cedar2025/Xboard) 为功能参考重写，
前端界面改编自 [shadcn-admin](https://github.com/satnaing/shadcn-admin)（MIT，
许可证见 `apps/user/LICENSE.shadcn-admin`）。
保留原仓库 Git 历史及 [MIT 许可证](LICENSE)。
新项目不依赖 PHP，不兼容旧数据库或旧插件；推送代码不会自动部署线上服务。
