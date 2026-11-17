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
| [TD-0005](TD-0005-catalog-category-isolation.md) | Ізоляція каталогу по категоріях | Approved (2026-09-06) — рецензія [TD-0005-review.md](TD-0005-review.md) |
| [TD-0006](TD-0006-google-merchant-feed-and-structured-data.md) | Google Merchant Center: фід та structured data | Approved (2026-09-06) — рецензія [TD-0006-review.md](TD-0006-review.md); реалізація — [Plan-0006](../plans/plan-0006-google-merchant.md) |
| [TD-0007](TD-0007-dealer-api.md) | Дилерське (B2B) API: товар за артикулом | Draft |
| [TD-0008](TD-0008-catalog-facets-and-filter-ux.md) | Фасети каталогу та UX фільтрів (Фаза 2) | Approved (2026-09-06) — рецензія [TD-0008-review.md](TD-0008-review.md); реалізація — [Plan-0007](../plans/plan-0007-catalog-facets.md) |
| [TD-0009](TD-0009-customer-payment-method-change.md) | Зміна способу оплати клієнтом і доплата LiqPay-замовлення | Approved (2026-09-06) — рецензія [TD-0009-review.md](TD-0009-review.md); реалізація — [Plan-0008](../plans/plan-0008-payment-method-change.md) |
| [TD-0010](TD-0010-partner-stock-api.md) | Партнерський API наявності та API-токени | Implemented locally — deployment pending |
| [TD-0011](TD-0011-order-status-flow.md) | Спрощений життєвий цикл замовлення: статуси рухають факти | Implemented locally (2026-10-03) — не закомічено, міграція не прогнана |
| [TD-0012](TD-0012-variant-promotions.md) | Акції на товари та варіанти (відсоткова знижка): `sale_price` виводиться, фід і JSON-LD віддають пару цін | Implemented locally (2026-10-04) — не закомічено |
| [TD-0013](TD-0013-general-catalog-and-seo.md) | Універсальний каталог і SEO | **Approved (2026-10-31)** — рішення власника за аудитом 31.10 внесено в чотири документи; M0 закрито, D02 лишається як baseline даних Search Console/Merchant; реалізація локально за Plan-0010, production не змінено; [SEO-матриця](TD-0013-seo-matrix.md), [API transition](TD-0013-api-transition.md), [протокол D06](TD-0013-catalog-mutations.md); [Plan-0010](../plans/plan-0010-general-catalog-and-seo.md) |
| [TD-0015](TD-0015-home-page-and-header.md) | Нова головна (структура маркетплейсу, банер «Аврора») і шапка сайту, шрифти Unbounded + Onest | Approved (2026-11-09); реалізовано локально 09.11 (Plan-0010 P25), незакомічено; робиться до релізу разом із каталогом |
