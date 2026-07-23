# Fillando — Meta Repository

Мета-репозиторій для керування розробкою **Fillando** — інтернет-магазину
витратних матеріалів для 3D-друку. Єдина точка входу: тут живе крос-компонентна
**документація** та **тулінг**, який збирає обидва компоненти в одне робоче
дерево. Самі компоненти клонуються в `repos/` і **не** комітяться сюди.

## Quick Links

| Ресурс | Посилання |
|--------|-----------|
| Гайд розробки (агент) | [CLAUDE.md](CLAUDE.md) |
| Онбординг | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Індекс документації | [docs/README.md](docs/README.md) |
| FRD (що реалізовано) | [docs/requirements/FRD.md](docs/requirements/FRD.md) |
| Архітектурні рішення | [docs/adr/README.md](docs/adr/README.md) |
| Git workflow | [docs/git-workflow.md](docs/git-workflow.md) |
| Env template | [docs/runbooks/env-template.env](docs/runbooks/env-template.env) |

## Репозиторії

Канонічний список (URL + branch) — [`repos.manifest`](repos.manifest).

| Repo | Stack | GitHub |
|------|-------|--------|
| **fillando-be** | NestJS, MongoDB, Mongoose, JWT, S3, Resend, Nova Post | `vvbogdanovih/fillando-be` |
| **fillando-fe** | Next.js 16, React 19, Tailwind CSS 4, Zustand, React Query | `vvbogdanovih/fillando-fe` |

## Getting Started

```bash
# 1. Clone meta repo
git clone <meta-repo-url> fillando-meta && cd fillando-meta

# 2. Clone child repos into ./repos (reads repos.manifest)
bash scripts/clone-all.sh

# 3. Copy env template and fill in values
cp docs/runbooks/env-template.env .env
# edit .env with real values

# 4. Sync env to child repos, then validate
bash scripts/sync-env.sh
bash scripts/validate-env.sh

# 5. Start backend
cd repos/fillando-be && yarn install && yarn start:dev

# 6. Start frontend (in another terminal)
cd repos/fillando-fe && yarn install && yarn dev
```

## Helper scripts

| Script | Що робить |
|--------|-----------|
| `scripts/clone-all.sh` | Клонує всі компоненти з manifest у `repos/`. |
| `scripts/pull-all.sh` | Fast-forward усіх склонованих компонентів. |
| `scripts/checkout-all.sh` | Перемикає компоненти на branch з manifest. |
| `scripts/status-all.sh` | Один рядок статусу (branch / sync / dirty) на компонент. |
| `scripts/sync-env.sh` | Розбиває master `.env` на `repos/<component>/.env`. |
| `scripts/validate-env.sh` | Перевіряє обов'язкові env-змінні + smoke-тести. |

`repos/` — gitignored, тож кожен компонент зберігає власну історію і комітиться
зі своєї теки на власний remote.
