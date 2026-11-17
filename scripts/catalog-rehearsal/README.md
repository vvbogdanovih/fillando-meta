# Catalogue rehearsal tools (Plan-0010 R01 / D08)

The release itself runs them through `../catalog-release.mjs` (one command for runbook §3.4–3.10: backup and its
restore check, baseline, dry-run, apply, verify, cache purge, new admin writes on, SEO statuses; resumable; no
in-place undo — a failed release restores the catalogue from its backup, runbook §5). Read-only HTTP probes used to compare the storefront and its consumers before and after the
filament v1→v2 migration. They were run on the 27.10 dump copy (see
`docs/plans/plan-0010-m0-evidence.md`, R01 2026-10-28) and are the baseline/verify steps of
`docs/runbooks/catalog-v2-release.md`. None of them writes anything, except `large-fixture.cjs` (below) and `tree-ops.mjs move` (journal writes through the synthetic API it is pointed at).

| Script | What it captures |
|---|---|
| `capture.mjs <api> <out.json>` | partner categories, every SKU, lookup and availability of all SKUs; price sheet (all pages); admin PDF as text; Google feed XML (generation date stripped) |
| `facets.mjs <api> legacy\|v2 <out.json>` | filament totals, first-page SKUs and normalised facet counts for 6 filter combinations |
| `compare.cjs <a.json> <b.json>` | section-by-section diff of two captures |
| `release-verify.mjs <api> <out.json>` | the storefront side of D08 §3.7: every visible product category (`GET /categories/options`, all pages — not the legacy list), legacy and typed listing status/total, every filament landing (status, count, `contract_version`, `filters_v2`, H1/title), `/catalog/sitemap`, refill cards and their notices; needs only `INTERNAL_API_TOKEN` |
| `release-check.cjs <before-dir> <after-dir>` | the §3.7 verdict: each dir holds `capture.json`, `facets.json` (legacy before, `v2` after) and `verify.json`; prints PASS/FAIL/SKIP per check and exits 1 on any FAIL. Allowed differences are exactly the documented ones — the value of the partner «Колір» row (must be the colour in the SKU name) and date-times in the feed. Every partner request must answer 200 on both sides (`capture.json` records `partner_token` and `partner_errors`, pagination included) and every price sheet page too: two failed captures hold the same empty lists and used to compare equal (audit 2026-11-07: partner 500 twice → ALL CHECKS PASSED). The only SKIP is a capture without `PARTNER_TOKEN` on both sides (every answer 401), as the PDF without `ADMIN_COOKIE`; a token or cookie that was given but refused is a FAIL, and so is a capture from an older `capture.mjs` |
| `seo-status.mjs <storefront-origin>` | §3.10: statuses, 308 targets, robots and canonical of the SEO matrix for a browser and for Googlebot, plus Product JSON-LD; exits 1 on any FAIL |
| `load.mjs <api> legacy\|v2 <label> [log.jsonl]` | 16 parallel requests (env `N`, `TOTAL`) per scenario — catalogue page, filters, product page; p50/p95/p99/max, rps. Finds filament by `GET /categories/slug/filament` (old and new API alike; `facets.mjs` too) |
| `load-large.mjs <api> <log.jsonl>` | D06 acceptance load on the synthetic large catalogue: `N` (10) concurrent readers for `SECONDS` (300) over tree pages, whole catalogue, groups, product categories with typed/colour/price filters, product pages and the product strips (`GET /products/catalog/v2/strip`, since 2026-11-15: `strip_new` — «Новинки» of the whole catalogue, `strip_sale` — «Акції» of the whole catalogue or a group, `strip_group`, `strip_category` — a collection over a product category, `strip_products` — a hand-picked list of 24 products; `limit` 8 or 24 as the storefront asks); p50/p95/p99/max and largest payload per scenario, API RSS every second (`API_PID`, or `API_CONTAINER=<name>` for an API in a Linux container — VmRSS of its PID 1); `SCENARIOS=a,b` runs a subset (`SCENARIOS=strip_new,strip_sale,strip_group,strip_category,strip_products` — the strips alone). The generated fixture has at most four SKUs per product, so every strip there ends after one step of its walk |
| `tree-ops.mjs <api> move\|reads [log.jsonl]` | D06 tree operations through the real API: `move` — `MOVES` (default 30) journal moves of draft and published categories (and the draft creations they need) with p50/p95/max, needs `ADMIN_COOKIE` (an ADMIN JWT of that API; writes only to the synthetic database it serves); `reads` — every tree read on a stress shape (the admin tree too, so it also needs `ADMIN_COOKIE`) (public/admin tree and children, all cursor pages; the deepest category's ancestors, all pages; deepest category and product; the product category options, all pages; catalogues; sitemap index and parts), FAIL for any non-200 or a payload over 2 MiB. The legacy `GET /categories` (unchanged for the old storefront until R04, never read by the new FE) only with `LEGACY_LIST=1`, reported but not counted |
| `db-compare.cjs <uriA> <dbA> <uriB> <dbB> [--ignore=a,b]` | byte comparison of two databases, collection by collection (documents sorted by `_id`, BSON bytes) and their indexes; prints only ids of differing documents — the proof that a restore or cleanup returned the copy to the reference dump (runbook §5, `local-mongodb.md`); needs `NODE_PATH=<fillando-be>/node_modules` |
| `sitemap-export.mjs` | module: `readCatalogSitemap(api)` — the backend sitemap index and all its parts as the one `{variants, categories, landings}` document (used by `release-verify.mjs` and `load.mjs`); `storefrontSitemapUrls(origin)` — every `<loc>` of `/sitemap.xml`, following a sitemap index (used by `seo-status.mjs`) |

**The one writing tool** — `large-fixture.cjs <fillando_load_YYYYMMDD> [--replace]` generates that synthetic
catalogue (20 sections × 10 groups × 49 product categories = 10 020 categories, 32 350 products, 100 000
active SKUs; 50 big categories of 1 025 SKUs and a long tail; colour axis on half the categories,
numeric size axis on the rest; `--promo=2` per cent of SKUs on promotion; `--images=3` photos per SKU and a longer
description (with the visible «Виробник» characteristic every SKU is a real feed item, as migrated filament is;
`--images=0 --description=short` reproduces the 29.10 fixture); `--name-length=N` pads category names (the ancestors
stress uses 200); `--shape=chain:20000` or `--shape=wide:150000` builds
the TD-0013 §6 stress trees instead, into `fillando_load_YYYYMMDD_<suffix>`). It writes **only** to a database named `fillando_load_YYYYMMDD[_suffix]` on the
local `127.0.0.1:27019` and refuses any other name; no real data is involved. Drop the database after
the measurement. Run the API against it on its own port with `RUN_CRON=false`, a throwaway
`INTERNAL_API_TOKEN` and random JWT secrets.

Environment: `INTERNAL_API_TOKEN` (the API's own value; bypasses the per-IP throttle),
`PARTNER_TOKEN` (a partner token valid on that API), `ADMIN_COOKIE` (`<access cookie name>=<jwt>`
of an ADMIN, for the PDF; optional — without it the PDF check is skipped, with a refused one it fails). On a rehearsal copy create a temporary partner token and delete it
afterwards; never point these at production without the release runbook.
