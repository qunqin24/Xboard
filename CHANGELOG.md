# Changelog

This project uses [Semantic Versioning](https://semver.org/). See the [release and upgrade guide](docs/releases.md) for operator instructions.

Before tagging `v1.2.3`, move the entries under a `## 1.2.3 - YYYY-MM-DD` heading. The release workflow requires that section and copies it into the GitHub Release.

## Unreleased

## 1.0.1 - 2026-11-20

- New logo: the panel as a planet with a node on its orbit, in the console and as the favicon. The mark follows the light and dark themes.

## 1.0.0 - 2026-11-20

- TypeScript rewrite with an Express API, a React user center and administrator console, and PostgreSQL persistence.
- Subscription generation, node reporting, plans, balance payments, tickets, promotions and operational audit.
- Bearer-authenticated administration API for automation.
- Epay and Stripe checkout, referral commissions and withdrawals, Telegram notifications, three human verification providers, and Chinese and English interfaces and email templates.
- Single-container deployment: one image serves the API and the web app with the security headers, behind the operator's own HTTPS reverse proxy. PostgreSQL stays a separate container.
- Multi-arch (amd64 and arm64) image `ghcr.io/qunqin24/xboard` with SBOM and provenance attestations, an `edge` tag that follows `main`, and GitHub Releases created from version tags.
- The admin console shows the running version and checks GitHub Releases for updates (Settings → About, plus a dashboard notice).
