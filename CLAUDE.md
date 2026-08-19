# CLAUDE.md — Fillando Meta Repository

Це мета-репозиторій для керування розробкою **Fillando** — інтернет-магазину витратних матеріалів для 3D-друку.

---

## Scope

Fillando складається з двох child-репозиторіїв:

| Repo | Directory | Stack | GitHub |
|------|-----------|-------|--------|
| **Backend** | `repos/fillando-be/` | NestJS, MongoDB (Mongoose), JWT, Argon2, S3, Resend, Nova Post API | `vvbogdanovih/fillando-be` |
| **Frontend** | `repos/fillando-fe/` | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Zustand, React Query, React Hook Form + Zod | `vvbogdanovih/fillando-fe` |

Child repos клонуються в директорію `repos/` (керується через `repos.manifest` + `scripts/clone-all.sh`) і **gitignored** в мета-репо. Кожен має власний remote і CLAUDE.md з деталями.

---

## Layout

```
fillando-meta/                ← мета-репо (цей git)
├── CLAUDE.md                 ← ви тут
├── README.md                 ← quick start
├── CONTRIBUTING.md           ← онбординг + як ми працюємо
├── .editorconfig             ← спільні правила форматування
├── .gitignore                ← ігнорить /repos/, .env
├── repos.manifest            ← канонічний список child repos (url + branch)
├── docs/
│   ├── README.md             ← індекс документації
│   ├── requirements/FRD.md   ← єдине джерело правди щодо функціоналу
│   ├── architecture/         ← overview, domain-model, state-machines
│   ├── adr/                  ← Architecture Decision Records (0001+)
│   ├── designs/              ← Technical Designs (TD)
│   ├── plans/                ← implementation plans
│   ├── runbooks/             ← deploy-гайди + env-template.env
│   ├── templates/            ← шаблони FRD / TD / plan / ADR
│   ├── git-workflow.md       ← branching, commits, PR
│   ├── environments.md       ← local / production, config & secrets
│   └── glossary.md           ← доменні терміни
├── scripts/
│   ├── clone-all.sh          ← клонування child repos у repos/
│   ├── pull-all.sh           ← fast-forward усіх child repos
│   ├── checkout-all.sh       ← перемикання на branch з manifest
│   ├── status-all.sh         ← branch / sync / dirty статус
│   ├── sync-env.sh           ← розподіл .env по child repos
│   └── validate-env.sh       ← перевірка env credentials
└── repos/                    ← [gitignored] child repos
    ├── fillando-be/          ← backend repo
    └── fillando-fe/          ← frontend repo
```

---

## Documentation Hierarchy

Документація організована за пріоритетом (повний індекс — `docs/README.md`):

1. **`docs/requirements/FRD.md`** — єдине джерело правди щодо реалізованого функціоналу
2. **`docs/architecture/`** — system overview, domain model, state machines
3. **`docs/adr/`** — Architecture Decision Records (прийняті рішення, не переглядаються — супернудяться новими)
4. **`docs/designs/`** + **`docs/plans/`** — TD перед реалізацією, потім implementation plan
5. **`docs/runbooks/`** — інструкції з деплою, env template
6. **`docs/templates/`** — шаблони для нових FRD / TD / plan / ADR
7. **`repos/fillando-be/CLAUDE.md`** — backend-специфічні конвенції та команди
8. **`repos/fillando-fe/CLAUDE.md`** — frontend-специфічні конвенції та команди

---

## Environment Management

### Master .env

Один `.env` файл в корені мета-репо містить ВСІ змінні для обох проектів. Секції розділені маркерами:

```
# === BEGIN COMMON ===
...
# === END COMMON ===
# === BEGIN BACKEND ===
...
# === END BACKEND ===
# === BEGIN FRONTEND ===
...
# === END FRONTEND ===
```

### Sync

```bash
bash scripts/sync-env.sh
```

Скрипт розбирає `.env` по секціях і записує:
- `repos/fillando-be/.env` ← COMMON + BACKEND
- `repos/fillando-fe/.env` ← COMMON + FRONTEND

### Validate

```bash
bash scripts/validate-env.sh
```

Перевіряє наявність обов'язкових змінних та базові smoke-тести підключень.

---

## Commands

```bash
# --- Manage child repos in repos/ (all read repos.manifest) ---
bash scripts/clone-all.sh      # clone (idempotent)
bash scripts/pull-all.sh       # fast-forward all
bash scripts/checkout-all.sh   # switch all to manifest branch
bash scripts/status-all.sh     # branch / sync / dirty per repo

# --- Env ---
bash scripts/sync-env.sh       # split root .env → repos/*/.env
bash scripts/validate-env.sh   # check required vars + smoke tests

# Backend
cd repos/fillando-be
yarn start:dev              # dev server (hot reload)
yarn build                  # build
yarn lint                   # ESLint
yarn test                   # unit tests

# Frontend
cd repos/fillando-fe
yarn dev                    # dev server (port 9000)
yarn build                  # production build
```

---

## Development Workflow

### Branch Strategy

- **`main`** — production-ready, з неї йде деплой
- **`dev`** — інтеграційна гілка в child repos; щоденна робота тут
- Default-гілка на GitHub лишається `main` — базу PR треба перемикати на `dev` вручну
- Feature branches створюються від `dev` в кожному child repo окремо
- PR в `dev` через GitHub; `dev → main` мерджиться перед релізом
- Виняток: `hotfix/*` йде від `main` і мерджиться в `main` **і** `dev`
- Мета-репо лишається на одній `main` — тут лише доки й тулінг

### Commit Conventions

Кожен child repo має свої конвенції (див. їхні CLAUDE.md). Мета-репо використовує:

```
docs: update FRD with new feature
scripts: add validate-env script
chore: update env template
```

### Working with Child Repos

Claude Code агент повинен:

1. **Читати CLAUDE.md** відповідного child repo перед будь-якою роботою в ньому
2. **Перевіряти docs/requirements/FRD.md** при додаванні нового функціоналу
3. **Оновлювати FRD.md** після завершення реалізації нової фічі
4. **Не змішувати** зміни між repos — один PR = один repo

---

## Key Architecture Facts

### Backend (fillando-be)

- **API prefix:** Немає глобального prefix (`/auth/login`, не `/api/auth/login`). `/api` додається тільки Nginx на production
- **Auth:** JWT (httpOnly cookies) + Google OAuth, Argon2 + pepper
- **Roles:** `USER`, `ADMIN`
- **DB:** MongoDB через Mongoose, repository pattern
- **File storage:** AWS S3 через presigned URLs
- **Email:** Resend API
- **Delivery:** Nova Post API integration
- **Swagger:** `/swagger`

### Frontend (fillando-fe)

- **Framework:** Next.js 16 App Router, React 19
- **State:** Zustand (auth store, cart store) + React Query
- **Forms:** React Hook Form + Zod
- **HTTP:** Axios singleton з auto token refresh
- **Cart:** Dual mode — guest (localStorage) + server (API)
- **Styling:** Tailwind CSS 4, single light theme (`:root` tokens only — there is no `.dark` block and `<html>` carries no theme class)
- **UI:** Custom components (shadcn/ui conventions), Radix UI primitives
- **i18n:** Українська мова, UAH валюта

---

## Planning Entry Points

| Що | Де |
|----|----|
| Індекс усієї документації | `docs/README.md` |
| Що вже реалізовано | `docs/requirements/FRD.md` |
| Прийняті архітектурні рішення | `docs/adr/README.md` |
| Доменні терміни | `docs/glossary.md` |
| Git workflow (branching, PR) | `docs/git-workflow.md` |
| Онбординг | `CONTRIBUTING.md` |
| Як налаштувати env | `docs/runbooks/env-template.env` + `docs/environments.md` |
| Шаблони нових документів | `docs/templates/` |
| Backend конвенції | `repos/fillando-be/CLAUDE.md` |
| Frontend конвенції | `repos/fillando-fe/CLAUDE.md` |
| API endpoints | `repos/fillando-be/openapi.json` |
