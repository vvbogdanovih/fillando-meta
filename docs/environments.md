# Environments

> Status: Draft · Defines the environments each component runs in and how
> configuration and secrets are handled. For step-by-step deployment, see the
> [runbooks](runbooks/deployment.md).

## Environments

| Environment | Purpose | Branch | Notes |
|-------------|---------|--------|-------|
| **local** | Developer machines. | `main` / feature | Backend `yarn start:dev` (hot reload); frontend `yarn dev` on port 9000. |
| **production** | Live system. | `main` | Deployed on LXC behind Nginx Proxy Manager via GitHub Actions CI/CD — see [runbooks](runbooks/). |

> There is no dedicated staging tier today. If one is added, mirror production
> and record it here and in the runbooks.

## API prefix

The backend exposes routes **without** a global prefix (`/auth/login`, not
`/api/auth/login`). The `/api` prefix is added **only by Nginx** on production.
Keep local clients pointed at the un-prefixed backend and set
`NEXT_PUBLIC_API_BASE_URL` accordingly per environment.

## Configuration

- Configuration is provided via **environment variables**, never hard-coded.
- The **master `.env`** lives in this meta repo (git-ignored) and is split into
  each component's `.env` by [`scripts/sync-env.sh`](../scripts/sync-env.sh).
  The canonical list of variables is
  [`docs/runbooks/env-template.env`](runbooks/env-template.env).
- Sections in the master `.env` are delimited by
  `# === BEGIN COMMON/BACKEND/FRONTEND ===` markers; `sync-env.sh` writes
  `COMMON + BACKEND` → `repos/fillando-be/.env` and
  `COMMON + FRONTEND` → `repos/fillando-fe/.env`.
- Validate with [`scripts/validate-env.sh`](../scripts/validate-env.sh).

## Secrets

- **Never** commit secrets (API keys, DB credentials, JWT secrets, the password
  pepper). The master `.env` and all `repos/*/.env` files are git-ignored.
- Rotate on exposure; prefer per-environment credentials.
- External services holding secrets: MongoDB, JWT/refresh secrets + password
  pepper, Google OAuth, AWS S3, Resend, Nova Post.

## Per-component notes

### fillando-be (NestJS)
Reads MongoDB connection, JWT/refresh secrets, password pepper, Google OAuth
credentials, AWS S3 config, Resend API key, Nova Post API key, and
`FRONTEND_URL` / `PORT` from env. Swagger is served at `/swagger`.

### fillando-fe (Next.js)
Reads `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SITE_URL` from env.
