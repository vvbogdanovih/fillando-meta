# Technical Designs (TD)

A Technical Design describes **what** we are building and **why**, and **how it
should work** — scope, requirements, proposed solution, data model, APIs,
trade-offs, and alternatives — **before** implementation. It is reviewed by the
team.

Start from [`../templates/technical-design.md`](../templates/technical-design.md),
copy it here as `NNNN-short-slug.md`, and set the front-matter status. See the
[TD vs. Implementation Plan](../README.md#td-vs-implementation-plan) note for
how a TD differs from a plan.

## Index

| TD | Title | Status |
|----|-------|--------|
| [TD-0001](TD-0001-liqpay-integration.md) | LiqPay online payment integration | Implemented |
| [TD-0002](TD-0002-catalog-taxonomy-and-landings.md) | Catalog taxonomy, colour standardisation and SEO landings | Approved |
| [TD-0003](TD-0003-order-cancellation-payment-status.md) | Payment status for cancelled orders (`VOIDED`) | Implemented |
| [TD-0004](TD-0004-cash-on-delivery.md) | Накладний платіж (cash on delivery) | Implemented |
| [TD-0005](TD-0005-catalog-category-isolation.md) | Ізоляція каталогу по категоріях | Draft — але Plan-0004 уже спирається на нього як на контракт; потребує рецензії |
| [TD-0006](TD-0006-google-merchant-feed-and-structured-data.md) | Google Merchant Center: фід та structured data | Draft — блокує Фазу 5; спершу 4 питання §8, потім рецензія, потім план |
| [TD-0007](TD-0007-dealer-api.md) | Дилерське (B2B) API: товар за артикулом | Draft |
