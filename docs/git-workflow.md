# Git Workflow

How we branch, commit, and merge across the Fillando repositories. Both
application components (`fillando-be`, `fillando-fe`) follow the same model.

## Branching model

`main` is the stable, production-ready branch. Work happens on short-lived
feature branches cut from `main` and merged back via Pull Request.

```mermaid
gitGraph
    commit id: "main"
    branch feature/product-search
    commit
    commit
    checkout main
    merge feature/product-search tag: "deploy"
```

| Branch | Purpose | Created from | Merges into |
|--------|---------|--------------|-------------|
| `main` | Production-ready, always deployable; deploys run from here. | — | — |
| `feature/<slug>` | A single feature or task. | `main` | `main` |
| `fix/<slug>` | Bug fix. | `main` | `main` |
| `hotfix/<slug>` | Urgent production fix. | `main` | `main` |

## Day-to-day flow

```bash
cd repos/fillando-be                    # or repos/fillando-fe
git checkout main && git pull
git checkout -b feature/product-search  # start work
# ...commit...
git push -u origin feature/product-search   # open a PR into main
```

1. Branch off `main` **inside the component repo** — each component has its own
   remote and history.
2. Keep branches small and short-lived.
3. Open a Pull Request into `main`. At least one review before merge.
4. Squash or rebase to keep history clean; delete the branch after merge.
5. **One PR = one repo.** Never mix backend and frontend changes in one PR.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
Scope is optional (the module/area). Examples:

```
feat(catalog): add product search with filters
fix(cart): merge guest cart on login
docs: update FRD with wholesale inquiries
```

## Pull Requests

- Target `main`.
- Describe **what** changed and **why**; link the related FRD section / TD / plan.
- Keep them reviewable — prefer several small PRs over one large one.
- CI must be green before merge.

## Meta repository

This meta repo uses a single `main` branch — it holds docs and tooling, not
application code. Its commits use `docs:`, `scripts:`, `chore:` prefixes.
`repos/` is git-ignored, so components are committed and pushed from inside their
own folders as usual.
