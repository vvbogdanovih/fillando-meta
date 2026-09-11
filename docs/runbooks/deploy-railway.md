# Deploy to Railway

Status: configuration prepared; live deployment and domain cutover are separate steps.

## Services

Connect the separate GitHub repositories `fillando-be` and `fillando-fe` as two
services in one Railway project. Do not connect `fillando-meta`: its `repos/`
directory is ignored by Git. Select the release branch (`main`) and root `/`.
Both repositories have a root `Dockerfile`; let its build and CMD control the service.
The old SSH workflows and production Compose files have been removed.

## Backend

Import production values into Railway Variables from the local `.env.prod`.
The file is excluded from Docker builds; it is not automatically uploaded.
Use `src/common/constants/env.constant.ts` in the backend as the required-variable list.

- `DATABASE_URL`: Atlas URI with explicit `/fillando-prod` before the query string.
- Preserve `PASSWORD_PEPPER` and `PAYMENT_ENCRYPTION_KEY` for restored data.
- Set `NODE_ENV=production`, `FRONTEND_URL`, `PUBLIC_API_URL`, and `GOOGLE_CALLBACK_URL`.
- Use the service `PORT`; the backend reads it. Match any public target port to it.
- Keep `RUN_CRON=false` during validation; enable jobs on one intended instance only.
- Configure Atlas network access for the deployed service.

The image includes system Chromium. Puppeteer uses `PUPPETEER_EXECUTABLE_PATH`;
its bundled browser download is disabled in both dependency-install stages.
The catalogue migration has already been run against Atlas. Do not configure it
as an automatic deployment command; scripts/reports are not needed in the runtime image.

## Frontend

Set these Variables before building; declared `ARG`s receive the public build values:

- `NEXT_PUBLIC_API_BASE_URL=https://api.fillando.com`
- `NEXT_PUBLIC_SITE_URL=https://fillando.com`
- `NEXT_PUBLIC_USE_IMAGE_DERIVATIVES=false` until the S3 backfill is verified
- Optional analytics values: `NEXT_PUBLIC_GOOGLE_ADS_ID`,
  `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION`, `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`,
  `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`

Use the actual deployment URLs for staging. Public variables are baked into the
bundle; rebuild after changing them. Set matching server-only `REVALIDATE_SECRET`
and, optionally, `INTERNAL_API_TOKEN` on both services (at least 32 characters).
Never put these secrets in `NEXT_PUBLIC_*` variables or public build arguments.
The standalone server listens on `0.0.0.0` and the runtime `PORT`.

## Validation and cutover

Deploy the backend first, then the frontend. Backend routes have no `/api` prefix;
point the frontend directly at the API origin. Check catalogue, login and token
refresh, Google OAuth, checkout/payment callbacks, uploads, and PDF generation.
Use own HTTPS subdomains under the same domain; review secure cookies before launch.
Add a dedicated backend readiness endpoint before configuring an API healthcheck;
`/health` is not currently implemented. Switch DNS only after service checks pass.

## Local development

Keep `yarn start:dev` for the backend and `yarn dev` for the frontend.
`yarn test:db:up` in the backend uses the unchanged `docker-compose.test.yml`:
MongoDB on `127.0.0.1:27018`, temporary test data in tmpfs. No `Dockerfile.local` is needed.

Reference: https://docs.railway.com/builds/dockerfiles

## Local verification (2026-09-11)

Both images built successfully with `docker build --platform linux/amd64`.
Isolated containers (`--network none`) passed:

- Frontend: standalone startup on `PORT=4317`, `/auth/login` returns HTTP 200.
- Backend: Chromium generates a PDF through Puppeteer; Argon2 hash/verify and
  Sharp PNG generation succeed; compiled `dist/main.js` exists.
- Neither runtime image contains `.env` or `.env.prod`; backend migration reports are absent.

These checks do not replace the deployed API/Atlas and integration checks above.
