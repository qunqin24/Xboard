# 发布与升级

版本号遵循语义化版本，标签形如 `v1.2.3`，预发布版用 `v1.2.3-rc.1`。镜像标签去掉开头的 `v`。

## 镜像

每个版本发布一个镜像 `ghcr.io/qunqin24/xboard`，支持 `linux/amd64` 和 `linux/arm64`。它同时提供 API 和前端页面，Compose 的 `migrate` 服务也用它执行数据库迁移。HTTPS 由站长自己的反向代理负责，见 [部署说明](typescript-deployment.md#反向代理)。

| 来源 | 生成的标签 |
| --- | --- |
| 推送标签 `v1.2.3` | `1.2.3`、`1.2`、`1`、`latest` |
| 推送标签 `v0.4.1` | `0.4.1`、`0.4`、`latest`（0.x 版本不打 `0`） |
| 推送标签 `v1.3.0-rc.1` | 只有 `1.3.0-rc.1`，不动 `latest` |
| 合并或推送到 `main` | `edge`，始终指向 `main` 最新一次通过检查的提交 |

生产环境请固定到完整版本号，例如 `1.2.3`。`edge` 未经版本审核，只用于试用和测试环境。

镜像带有 OCI 标签和注解（来源仓库、提交、版本、许可证），以及 BuildKit 生成的 SBOM 和构建来源证明。另外还有一份由 GitHub 签名的构建来源证明，可以这样核对镜像确实由本仓库的工作流构建：

```bash
gh attestation verify oci://ghcr.io/qunqin24/xboard:1.2.3 --repo qunqin24/Xboard
docker buildx imagetools inspect ghcr.io/qunqin24/xboard:1.2.3 --format '{{json .SBOM}}'
```

## 发布新版本

1. 确认要发布的提交已经合并到 `main`，并且 CI 通过。
2. 在 `CHANGELOG.md` 里把 `## Unreleased` 下面的条目移到新的版本标题下，标题写成 `## 1.2.3 - 2026-11-20`。写明行为变化、数据库迁移和需要站长处理的配置。提交并推送到 `main`。
3. 在这个提交上打标签并推送：

    ```bash
    git tag -a v1.2.3 -m "v1.2.3"
    git push origin v1.2.3
    ```

4. 在 GitHub 的 Actions 页面查看 `Release` 工作流。它依次完成：
    - 校验标签格式，并确认 `CHANGELOG.md` 有这个版本的条目（预发布版可以没有，届时更新说明只列提交）；
    - 跑完整检查，和 CI 相同；
    - 在 amd64 和 arm64 原生机器上分别构建镜像，合并成多架构镜像推到 GHCR，生成 SBOM 和构建来源证明；
    - 创建 GitHub Release，正文是 `CHANGELOG.md` 里这个版本的条目、镜像拉取命令，后面附上 GitHub 自动生成的提交与 PR 列表。预发布标签会标成 Pre-release。
5. 第一次发布后，在 GitHub 个人主页的 Packages 里打开 `xboard`，确认可见性是 Public。新建的包可能默认是 Private，那样别人拉取需要登录。

检查或构建失败时，不会给镜像打上版本标签，也不会创建 Release；修好后可以删掉这个标签，在新提交上重新打。镜像已经推送之后才发现问题，就发下一个补丁版本，不要移动已发布的标签。只有创建 Release 这一步失败时，在 Actions 页面重跑它即可，已有的 Release 不会被覆盖。

## 工作流

工作流都在 `.github/workflows/`，第三方 action 固定到提交哈希，权限按任务单独给。

| 文件 | 触发 | 内容 |
| --- | --- | --- |
| `ci.yml` | 每个 PR，推送到 `main` | 完整检查；PR 上构建镜像但不推送；`main` 检查通过后推送 `edge` |
| `release.yml` | 推送 `v*` 标签 | 校验、完整检查、推送版本镜像、创建 GitHub Release |
| `checks.yml` | 被上面两个调用 | `pnpm api:generate`、`format:check`、`typecheck`、`test`、`build`，带 PostgreSQL 17 服务 |
| `images.yml` | 被上面两个调用 | 构建 `apps/Dockerfile` 的 `app` 目标，按需推送、合并多架构、生成证明 |

## 使用发布的镜像

在 `ops/.env` 里写上目标版本，`migrate` 和 `app` 两个服务都会用它：

```bash
XBOARD_IMAGE=ghcr.io/qunqin24/xboard:1.2.3
```

```bash
docker compose --env-file ops/.env -f compose.production.yaml up -d --no-build --pull always
```

不设 `XBOARD_IMAGE` 时，Compose 从当前代码构建，镜像名是 `xboard:local`。

## 升级与回退

后台“系统设置 → 关于”显示当前运行的版本和构建它的提交，并提供“检查更新”。服务器每小时向 GitHub 查询一次 `APP_UPDATE_REPO`（默认 `qunqin24/Xboard`）的最新正式版本，有新版本时仪表盘顶部会出现提示。服务器无法访问 GitHub 时，页面会显示检查失败，不影响其他功能。在 `ops/.env` 里写 `APP_UPDATE_REPO=`（留空）可以关闭检查，服务器就不再访问 GitHub。版本号来自镜像：发布的镜像是标签上的版本，`edge` 镜像显示 `edge`，不和正式版本比较。

升级 TypeScript 版之前，备份 PostgreSQL 和应用密钥，并读一遍目标版本 Release 里的数据库迁移和配置说明。把 `XBOARD_IMAGE` 改成目标版本，或检出对应版本标签后重新构建。Compose 的 `migrate` 服务先执行前向迁移，成功后再启动应用。升级后检查 `/api/health`、登录、订单和一条订阅链接，保留本次备份直到验证完成。

如果需要回退应用代码，先核对目标版本与当前数据库结构的兼容性。涉及数据库恢复时，先在独立库验证，再切换到完整的备份。保存新的写入记录并核对用户余额、订单和流水。具体步骤见 [部署文档](typescript-deployment.md)。

旧 PHP Xboard / V2Board 与 TypeScript 版的数据库结构不同。旧站升级需要规划数据迁移，保留独立旧库副本，并逐台更换节点通信密钥。
