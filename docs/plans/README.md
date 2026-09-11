# Implementation Plans

An Implementation Plan describes **how and when** we deliver a specific piece of
work — the breakdown into small, PR-sized tasks, sequencing, which repos change,
and risks. It usually follows an approved [Technical Design](../designs/).

Start from [`../templates/implementation-plan.md`](../templates/implementation-plan.md),
copy it here as `NNNN-short-slug.md`, and set the front-matter status.

Remember: **one PR = one repo** — a plan touching both `fillando-be` and
`fillando-fe` still lands as separate PRs per component.

## Index

Shipped plans are deleted once their feature is `Done` — git history has them,
so this table only lists plans that are still active.

| Plan | Title | Remaining work |
|------|-------|----------------|
| [Plan-0002](plan-0002-catalog-seo-roadmap.md) | Catalog SEO & UX roadmap | Контент/блог, розширення каталогу та решта фаз; перехід каталогу виконано |
| [Plan-0003](plan-0003-security-hardening.md) + [чекліст](plan-0003-execution-checklist.md) | Вразливості та воронка замовлення | Підтвердження релізу й ручні LiqPay-перевірки |
| [Plan-0005](plan-0005-catalog-target-state.md) + [додаток](plan-0005-appendix-gap-list.md) | Цільовий стан каталогу — трекер приймання | Приймання екранів, контент, Google та залишкові перевірки релізу |
| [Plan-0006](plan-0006-google-merchant.md) | Google Merchant | Налаштування кабінетів Google і перевірки після релізу |
| [Plan-0007](plan-0007-catalog-facets.md) | Фасети та UX фільтрів | Прибрати deprecated `filter_options` після переходу всіх клієнтів |
| [Plan-0008](plan-0008-payment-method-change.md) | Зміна способу оплати | Ручні LiqPay-сценарії та приймання |
| [Plan-0009](plan-0009-filament-attribute-optionality.md) | Обов’язковість характеристик | Код і production-міграція виконані; підтвердити розгортання застосунків і результат у фіді |

Стан таблиці актуалізовано 2026-09-11 за відомими виконаними роботами. Історичні
позначки «не запушено», «код у dev» та «0 з 14 екранів» усередині старих планів
не є перевіркою поточного production. Непідтверджені ручні перевірки залишаються відкритими.

**Plan-0005** зберігає матрицю приймання, зокрема залишкові перевірки вже реалізованих
частин. Виконання міграції не закриває автоматично налаштування Google чи ручні сценарії оплати.

## Removed completed plans

Plan-0004 (каталог: таксономія, кольори, лендінги та SEO-гігієна) прибрано 2026-09-11:
код і міграції виконані, актуальний контракт описаний у [FRD](../requirements/FRD.md),
а подальше приймання лишається в Plan-0005. Історичний документ доступний у Git мета-репозиторію:

```sh
git show 0b355c69bc4e24da65004fa6ca4b469537668458:docs/plans/plan-0004-catalog-phase-1.md
```
