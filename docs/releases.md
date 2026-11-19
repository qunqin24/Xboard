# 发布与升级

版本标记使用语义化版本格式，例如 `v1.2.3`。标记推送后，GitHub Actions 会运行完整检查，再从同一提交构建 API 和 Web 镜像并发布到 GHCR。非正式版可用 `v1.2.3-rc.1`。镜像版本号去掉开头的 `v`。

- API 镜像 `ghcr.io/qunqin24/xboard-api`
- Web 镜像 `ghcr.io/qunqin24/xboard-web`

生产 Compose 可通过覆盖文件使用同一发布版本的镜像。将以下内容保存为仓库根目录的 `compose.release.yaml`，把 `1.2.3` 换成目标版本。

```yaml
services:
  migrate:
    image: ghcr.io/qunqin24/xboard-api:1.2.3
  api:
    image: ghcr.io/qunqin24/xboard-api:1.2.3
  web:
    image: ghcr.io/qunqin24/xboard-web:1.2.3
```

```bash
docker compose --env-file ops/.env -f compose.production.yaml -f compose.release.yaml up -d --no-build --pull always
```

发布前完成 `CHANGELOG.md` 的版本记录。发布后在 GitHub Release 中连同变更范围、数据库迁移及部署说明一起公布。

升级 TypeScript 版之前，备份 PostgreSQL 和应用密钥。选择同一版本的 API 与 Web 镜像，或从对应版本标签构建 `apps/Dockerfile` 的两个目标。Compose 的 `migrate` 服务先执行前向迁移，成功后再启动 API。升级后检查 `/api/health`、登录、订单和一条订阅链接，保留本次备份直到验证完成。

如果需要回退应用代码，先核对目标版本与当前数据库结构的兼容性。涉及数据库恢复时，先在独立库验证，再切换到完整的备份。保存新的写入记录并核对用户余额、订单和流水。具体步骤见 [部署文档](typescript-deployment.md)。

旧 PHP Xboard / V2Board 与 TypeScript 版的数据库结构不同。旧站升级需要规划数据迁移，保留独立旧库副本，并逐台更换节点通信密钥。
