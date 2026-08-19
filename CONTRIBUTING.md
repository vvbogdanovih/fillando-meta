# Contributing

Welcome to **Fillando**. This meta repository is your starting point — it holds
the cross-cutting documentation and the tooling that assembles both application
components (`fillando-be`, `fillando-fe`) into one working tree.

## 1. Get set up

```bash
# Clone the meta repo
git clone <meta-repo-url> fillando-meta
cd fillando-meta

# Pull every component into ./repos
bash scripts/clone-all.sh

# Copy the env template, fill in real values, then distribute to child repos
cp docs/runbooks/env-template.env .env
# ...edit .env...
bash scripts/sync-env.sh
bash scripts/validate-env.sh
```

Prerequisites: `git`, Node ≥ 20 with `yarn`, an SSH key registered with GitHub
(the manifest uses the `github_vvbogdanovih` SSH host alias — see
[`repos.manifest`](repos.manifest)), and `mongosh` / AWS CLI if you want the
connectivity smoke tests in `validate-env.sh`.

## 2. Helper scripts

| Script | What it does |
|--------|--------------|
| [`scripts/clone-all.sh`](scripts/clone-all.sh) | Clone every component from the manifest into `repos/`. |
| [`scripts/pull-all.sh`](scripts/pull-all.sh) | Fast-forward every cloned component. |
| [`scripts/checkout-all.sh`](scripts/checkout-all.sh) | Switch every component to its manifest branch. |
| [`scripts/status-all.sh`](scripts/status-all.sh) | One-line branch / sync / dirty status per component. |
| [`scripts/sync-env.sh`](scripts/sync-env.sh) | Split the master `.env` into `repos/<component>/.env`. |
| [`scripts/validate-env.sh`](scripts/validate-env.sh) | Check required env vars and smoke-test connections. |

## 3. How we work

- **Branching & commits:** follow [`docs/git-workflow.md`](docs/git-workflow.md)
  (`dev` as the default integration branch + feature branches per component,
  `main` for releases, Conventional Commits, PR rules).
- **Before building a feature:** check the [FRD](docs/requirements/FRD.md); for
  non-trivial work write a Technical Design ([`docs/designs/`](docs/designs/))
  and an implementation plan ([`docs/plans/`](docs/plans/)).
- **Document decisions** as ADRs ([`docs/adr/`](docs/adr/)).
- **After shipping**, update the [FRD](docs/requirements/FRD.md) — it is the
  source of truth for implemented functionality.
- **One PR = one repo.** Never mix changes across `fillando-be` and
  `fillando-fe` in a single PR.

## 4. Where things live

See the [documentation index](docs/README.md) for the full map of requirements,
architecture, designs, plans, runbooks, and templates.
