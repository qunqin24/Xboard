# 个人开发与改造指南

仓库：<https://github.com/qunqin24/Xboard>。上游：
<https://github.com/cedar2025/Xboard>，保留其提交历史、署名和 MIT 许可证。

## 分支与线上隔离

- **`master`：建议改造的开发主分支。** 基于上游 `d826a3b`，保留上游已有的
  鉴权、支付、订单等安全修复，并带上 Hy2 未设置带宽时省略空字段的兼容性修复。
- **`production-snapshot-20261116`：脱敏线上源码快照。** 用于对照业务行为和迁移，
  是较旧的应用基线，不能当成安全维护后的生产版本直接部署。
- 服务器开发副本：`/root/Xboard-dev`；已有生产部署仍在 `/root/Xboard`。
  本次导出没有修改生产配置、数据库、容器或节点服务。
- 代码推送不自动部署，也不自动发布镜像。GitHub Actions 镜像发布保留手动触发。

## 先看这些目录

| 目录 | 用途 |
| --- | --- |
| `app/Http/Controllers`、`app/Http/Requests` | 接口与参数校验 |
| `app/Services`、`app/Models` | 业务逻辑与数据模型 |
| `app/Protocols` | Clash/Mihomo、Shadowrocket、Sing-box 等订阅生成 |
| `app/Http/Routes`、`routes` | 路由 |
| `database/migrations` | 数据库变更；先在开发数据库验证 |
| `plugins-core`、`plugins` | 内置与可选插件 |
| `resources/rules` | 默认分流配置模板 |
| `theme/Xboard` | 默认用户主题、模板与已有静态资源 |
| `public/assets/admin` | 上游管理后台打包产物子模块 |

**前端范围说明：** 上游后台是单独的 `xboard-admin-dist` 子模块，当前公开的是
打包产物，不是完整的 React/TypeScript 开发工程。默认用户主题也包含已编译的
JavaScript。因此此仓库不能被描述为“包含全部前端原始工程”。大改 UI 时应另接入
可维护的前端源码或新建前端，通过这里的 API、模板和资源入口集成；不要只改压缩 JS。

## 本地开发示例

在新目录操作，**不要在生产目录运行以下命令，也不要复制线上 `.env` 或数据库**：

```bash
git clone --recurse-submodules https://github.com/qunqin24/Xboard.git
cd Xboard
cp .env.example .env
mkdir -p .docker/.data/dev-sqlite storage/logs storage/theme plugins
docker compose -f compose.dev.yaml build web
docker compose -f compose.dev.yaml up -d redis
docker compose -f compose.dev.yaml run --rm web php artisan xboard:install
docker compose -f compose.dev.yaml up -d web horizon
```

安装时创建自己的开发管理员和独立应用密钥，妥善保存安装器输出。
开发入口默认只绑定 `127.0.0.1:17001`；远程开发请用 SSH 隧道，不要直接暴露测试面板。
使用独立的 `xboard-development` Compose 项目、SQLite 目录和 Redis 卷，不接入生产数据。
源码修改后重新构建并重建开发 Web 容器；业务队列代码修改后也需重建开发 Horizon。

`Dockerfile` 构建当前检出的源码，不会偷偷克隆上游覆盖你的修改。
它保留 PHP **8.2.35+** 安全版本检查；如果基础镜像太旧，构建会明确失败。
请选择满足要求的受支持 Swoole/PHP 镜像或维护自己的安全基础镜像，不要删掉检查绕过。

## 检查与测试

安装 Composer 依赖后可运行专门的订阅回归检查：

```bash
php tests/Regression/ClashMetaBandwidthTest.php
```

检查 Hy2 空带宽、显式数值、带单位字符串、单向设置、Hy1 不变、TLS 和混淆参数，
共 21 项。修复前的线上订阅曾复现 Mihomo `payload[3][up/down] invalid`；
修复后的线上订阅已经通过 Mihomo v1.19.33 配置解析检查。

本次还做了 PHP 语法、依赖配置与 Compose 静态检查，但没有启动这个新开发实例、
执行数据库迁移或跑完整业务/前端测试；这不等于该分支已具备生产部署验收结论。
上游 Composer 配置仍有未限定版本约束及锁文件同步警告，本次没有擅自升级全部依赖；
开工时请先审查 `composer.json` / `composer.lock`，协调必要的依赖更新再安装。
上线前请检查依赖安全公告、备份数据并完成支付、鉴权、订阅和数据库迁移测试。

## 保密与更新

- 不提交 `.env`、账户/订阅 Token、支付密钥、数据库、私钥、运行缓存、日志或备份。
- `.env.example` 的 `APP_KEY` 留空，不能复用任何示例密钥。
- 后台“在线升级”仍是上游维护逻辑，不应用它覆盖这个自定义 Fork。
  用 Git 管理改动、合并上游更新、验证后再构建与部署。
- 密钥扫描中已复核上游 PEM 标记拼接代码、reCAPTCHA **公开站点密钥**与测试用虚构 Token 的误报；
  实际生产应用、账户和支付秘密未带入仓库。
