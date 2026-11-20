# Xboard TypeScript

[简体中文](README.md)

Xboard manages subscriptions, plans, nodes and customer accounts. It uses React, Express, Prisma and PostgreSQL. The admin console manages balance, offline and online payments, audit records, tickets, mail and promotions. Xboard includes Epay and Stripe, referral commissions and withdrawal review, Telegram notifications, human verification, and Chinese and English interfaces and email templates. The [operations API](docs/ops-api.md) lets administrators automate management with Bearer tokens.

![Admin dashboard](docs/images/overview.png)

## Start locally

Use Node.js 24, pnpm 11.0.3 and Docker with Compose v2, or a dedicated PostgreSQL 17 development database.

```bash
pnpm install
docker compose -f compose.typescript.yaml up -d
cp -n .env.example .env
pnpm db:setup
pnpm dev
```

The web app runs at <http://127.0.0.1:5173>, the admin console at `/admin`, and the development API reference at <http://127.0.0.1:3001/api/docs>. See [Architecture](ARCHITECTURE.md) for account provisioning and business rules.

## Deploy

Deploy the image published on GitHub. The server needs neither the source nor a build.

You need:

- A Linux server (amd64 or arm64) with Docker Engine and Compose v2.
- A domain pointing at the server.
- A reverse proxy that handles HTTPS, such as Caddy, Nginx or 1Panel.

**1. Download the deployment files**

```bash
mkdir -p xboard/ops && cd xboard
curl -fsSLo compose.production.yaml https://raw.githubusercontent.com/qunqin24/Xboard/v1.0.0/compose.production.yaml
curl -fsSLo ops/.env https://raw.githubusercontent.com/qunqin24/Xboard/v1.0.0/ops/.env.example
```

**2. Fill in `ops/.env`**

```bash
APP_DOMAIN=panel.example.com
POSTGRES_PASSWORD=replace-with-your-own-long-random-password
XBOARD_IMAGE=ghcr.io/qunqin24/xboard:1.0.0
```

Generate the database password with `openssl rand -hex 32`. Pin `XBOARD_IMAGE` to a full version rather than `latest` or `edge`, so you decide when to upgrade. The other settings in the file are optional.

**3. Start**

```bash
docker compose --env-file ops/.env -f compose.production.yaml up -d --no-build --pull always
```

This runs two containers, the application and PostgreSQL, and applies database migrations before the application starts. The application listens on `127.0.0.1:3001` only.

**4. Set up the reverse proxy**

Forward every request for the domain to `127.0.0.1:3001`. With Caddy these three lines are enough, and it obtains the certificate itself:

```caddyfile
panel.example.com {
	reverse_proxy 127.0.0.1:3001
}
```

For Nginx, and for keeping the real client IP behind a CDN, see the [deployment guide](docs/typescript-deployment.md#反向代理).

**5. Create the administrator**

Open `https://your-domain/setup`. The installation code is in the application log, on the `setup.available` line:

```bash
docker compose --env-file ops/.env -f compose.production.yaml logs app | grep setup.available
```

The setup page closes once the administrator exists. Configure email, backups, alerts and payments under Settings in the admin console.

### Upgrade

Settings → About in the admin console shows the running version, and the dashboard shows a notice when a newer release is out. To upgrade:

1. Back up the database and the application key; see [releases and upgrades](docs/releases.md#升级与回退).
2. Read the notes of the new release.
3. Set `XBOARD_IMAGE` in `ops/.env` to the new version.
4. Run the start command from step 3 again.

### Build from source

If you change the code, or the server cannot reach GHCR, build on the server instead:

```bash
git clone https://github.com/qunqin24/Xboard.git && cd Xboard
cp ops/.env.example ops/.env   # set APP_DOMAIN and POSTGRES_PASSWORD, leave XBOARD_IMAGE unset
docker compose --env-file ops/.env -f compose.production.yaml up -d --build
```

### Publish a release

Add the version entry to `CHANGELOG.md`, then push a tag such as `v1.2.3` from `main`. GitHub Actions runs the full checks, pushes the amd64 and arm64 image and creates the GitHub Release. See [publishing a release](docs/releases.md#发布新版本).

The TypeScript edition uses a new database schema. Plan a separate migration for data from the PHP edition, keep a copy of the old database, and rotate node credentials when switching.

## Development

- [Architecture and business rules](ARCHITECTURE.md)
- [Node integration](docs/typescript-nodes.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [MIT license](LICENSE)

The frontend adapts [shadcn-admin](https://github.com/satnaing/shadcn-admin). Its license is in [apps/user/LICENSE.shadcn-admin](apps/user/LICENSE.shadcn-admin).
