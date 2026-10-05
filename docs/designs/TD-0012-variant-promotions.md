# TD-0012 — Акції на товари та варіанти (відсоткова знижка)

- **Status:** Implemented locally (2026-10-04) — BE і FE у робочих деревах `dev`, не закомічено
- **Author:** vvbogdanovih
- **Reviewers:** власник погодив рішення §2 2026-10-04
- **Date:** 2026-10-04
- **Components:** both (fillando-be, fillando-fe)
- **Related:** [TD-0006](TD-0006-google-merchant-feed-and-structured-data.md) (фід і JSON-LD) ·
  [TD-0009](TD-0009-customer-payment-method-change.md) (купони на чекауті) · FRD §6 (каталог), §7
  (кошик/чекаут), §9 (адмінка товарів), §12 (фід), §16 (партнерський API), §18.6/§18.8 (модель) ·
  пам'ять `prom-pricing-by-design`

## 1. Summary

Власник ставить акцію на товар (усі варіанти) або на один варіант: відсоток знижки і необов'язкова
дата «до». Вітрина показує плашку «−N %», закреслену регулярну ціну й акційну; Google Merchant фід
віддає `price` + `sale_price` (+ `sale_price_effective_date`), JSON-LD — ту саму пару. Купони на
акційні рядки не діють.

## 2. Рішення

| Питання | Рішення | Чому |
|---|---|---|
| Де зберігати | **На варіанті**: `promo_percent` (1..90, ціле), `promo_ends_at` (Date або null) | Усі читачі ціни (каталог, кошик, замовлення, фід, партнерський API) працюють із варіантами без join на товар. «Акція на весь товар» = масовий запис у всі варіанти |
| Що зберігати | Лише відсоток і дату. **`sale_price` виводиться при читанні**, ніколи не зберігається | `price` кожні 30 хв перезаписує Prom-синк (ціна постачальника + націнка 30–120 ₴). Акція, записана в `price`, зникла б за пів години |
| Формула | `sale_price = floor(price × (1 − p/100) + 0.5)` (половина — вгору на обох сторонах; Mongo `$round` округлює до парного); активна, коли percent є, `promo_ends_at` порожня або > now, і `0 < sale_price < price` | Цілі гривні; відсоток, що округлюється до тієї самої ціни (1 % від 49 ₴), — не акція: Merchant відхиляє `sale_price ≥ price`, а плашка «−1 %» брехала б |
| Початок | Немає — акція стартує записом | Простіше; у фіді вікно починається з моменту генерації |
| Прострочена акція | Лишається на документі, усі читачі бачать «немає» | Адмін бачить історію; нічого не треба писати в базу за розкладом |
| Купони | **Не складаються з акцією — на кожному рядку діє більша зі знижок, обидві від регулярної ціни** (переглянуто власником 2026-10-05; до того купон акційні рядки не чіпав). `extra = max(0, list_price × qty × % − (list_price − price) × qty)`, `discount_amount = round2(Σ extra)`; якщо сума 0 — `400 COUPON_NOT_APPLICABLE`. Реалізація: `coupon-pricing.ts` (BE) і `couponDiscountAmount` у `price.utils.ts` (FE) | Покупець з купоном −15 % на товар −10 % має отримати 15 % від ціни до акції, а не 15 % від акційної і не 25 %; одноразовий купон не спалювати на 0 |
| Знімок у замовленні | `OrderItem.price` = ефективна (що платить покупець), `list_price` = регулярна, `promo_percent` | Підсумки сходяться; видно, за якою акцією продано |
| Партнерський API | `price` регулярна + `sale_price \| null` | B2B бачить і те, і те |
| Прайс-лист PDF | Оптові рівні від регулярної, без змін | Оптова знижка не комбінується з роздрібною акцією |
| Плашка | Картка каталогу + сторінка товару; кошик і чекаут — лише ефективна ціна | Рішення власника |
| Собівартість | Адмінка попереджає, коли `sale_price < supplier_price` (`prom_base_price × (1 − prom_discount_ratio)`) | Маржа 3,6–8,9 %: знижка понад ~6 % продає нижче закупівлі |

## 3. Контракт BE ↔ FE

- Публічний варіант / позиція каталогу / `item.variant` кошика / рядок прайс-листа: `price`
  (регулярна), `sale_price: number | null`, `promo_percent: number | null`, `promo_ends_at: string | null`
  — усі три null поза активною акцією. Ефективна ціна = `sale_price ?? price`.
- Адмін: `PATCH /products/:id/variants/:variantId`, `POST …/variants`, `POST /products` приймають
  `promo_percent: number | null`, `promo_ends_at: string | null` (ISO, у майбутньому). Новий
  `PATCH /products/:id/promotion` — `{ promo_percent: number, promo_ends_at?: string | null } |
  { promo_percent: null }` → усі варіанти товару, відповідь `{ matched, modified, variants }`.
  Адмінські `GET /products/:id/variants[/:variantId]` додають `supplier_price: number | null`.
- Помилки 400: `PROMO_PERCENT_REQUIRED` (дата без відсотка), `PROMO_ENDS_IN_PAST`;
  `COUPON_NOT_APPLICABLE` при `POST /orders`.
- Фід: `g:price` регулярна; при акції `g:sale_price`; при даті `g:sale_price_effective_date =
  <generatedAt>/<ends_at>` як `YYYY-MM-DDThh:mm:ss+00:00`; `custom_label_3` (ціновий діапазон) — від
  ефективної. JSON-LD: `offers.price` = ефективна, `priceSpecification: [{ UnitPriceSpecification,
  priceType: ListPrice, price: регулярна }]`, `priceValidUntil = promo_ends_at` (інакше +90 днів).

## 4. Реалізація BE

- `src/modules/product/promo-pricing.ts` — єдине джерело правила: `activePromo`, `salePriceOf`,
  `effectivePriceOf`, `publicPromoFields` (JS) і `promoActiveExpr`, `salePriceExpr`,
  `effectivePriceExpr`, `publicPromoProjection` (Mongo, `$$NOW` за замовчуванням); паритет
  доводить `product-variant-promo.int-spec.ts`. `resolvePromoPatch` — правила запису.
- Читачі: `toPublicVariant` і `PRICE_SHEET_PUBLIC_PROJECTION` (`product-public.mappers.ts`),
  `findCatalogItems` (фільтр/сорт/межі слайдера/фасети по `_effective_price`),
  `findSearchResults`, `findVariantWithProduct` (+ сусіди, одна мить `now` на відповідь),
  `findSpooledCounterpart` (`sale_price` котушки; «від» лишається по регулярній),
  `findActiveForFeed` + `buildItem`, `CartService.populateItems`, `OrderService.buildOrderItems`
  (`couponEligibleSubtotal`), партнерський `toProduct`.
- Свіжість: `FeedRefreshSignal` (`src/common/services/feed-refresh.signal.ts`, дебаунс 5 с,
  singleton як `storefrontRevalidation`) → `FeedCronService` підписується до гейта `RUN_CRON`;
  `PromoExpiryCronService` (кожні 10 хв, `RUN_CRON`) — `countPromosEndedBetween` →
  `revalidate('products')` + той самий сигнал. Нічого в базу не пише. Запит під час поточної
  генерації стає в чергу у `FeedService.requestRerun()` і виконується з `finally` у `generate()` —
  саме там, а не в кроні, бо ручний `POST /feeds/google-shopping/regenerate` викликає `generate()`
  напряму. Це best-effort межі свіжості (сигнал внутрішньопроцесний, крон — на одній репліці),
  підлога — щогодинна генерація.
- Документи BE: `DATA_MODELS.md`, `MERCHANT_FEED.md` («Promotions and freshness»),
  `API_AND_SWAGGER.md`, `ORDER_ADMIN_API.md`, `CART_FLOW.md`, `PRICE_SHEET.md`, `PARTNER_API.md`,
  `STOREFRONT_REVALIDATION.md`, `PROM_AVAILABILITY_SYNC.md`, `CLAUDE.md`.

## 5. Реалізація FE

- `common/utils/price.utils.ts`: `PromoPriced`, `isPromoActive`, `effectivePrice`,
  `promoPercentLabel` («−15 %»), `formatPromoEndsAt`; `common/components/PriceTag.tsx` — єдине
  місце, де вітрина друкує ціну з `<s>` і прихованими підписами для читача екрана.
- Вітрина: `CatalogProductCard` (плашка над фото + `PriceTag`), `ProductPage` (плашка біля ціни,
  «Акція до dd.mm», ефективна в GA4 і в meta кошика), `PriceSheet`. Кошик/чекаут — ефективна ціна;
  чекаут рахує купон від неакційних рядків і пояснює це одним рядком.
- JSON-LD `buildProductJsonLd`: ефективна ціна, `priceSpecification` ListPrice, `priceValidUntil`.
- Адмінка: картка «Акція» на сторінці товару (`PromotionCard`, `PATCH /products/:id/promotion`),
  поля у `VariantModal`, позначка «−N %» у таблиці варіантів, попередження про собівартість.

## 5a. Рецензія коду (2026-10-04) — виправлено до коміту

- Округлення: `Math.round` ↔ `$round` розходилися на .5 (212,5 → 213 на сторінці, 212 у фільтрі) — обидві сторони тепер `floor(x + 0.5)`; паритетний int-spec має фікстуру 250 × 15 %.
- `sale_price ≥ price` або 0 після округлення → акція неактивна (інакше Merchant відхиляє позицію).
- Сигнал перебудови фіду під час поточної генерації не губиться — ставиться в чергу й виконується після неї; крон закінчення акцій теж іде через сигнал.
- Новий відсоток на варіанті з простроченою датою очищує дату (інакше нова акція була б мертвою з першої секунди).
- Watermark крону закінчення зсувається лише після успішного запиту.
- Валідація promo у `POST /products` — до створення товару (немає транзакцій).
- DTO вимагає дату з часом (`YYYY-MM-DDT…`): date-only читалася б як 02:00 за Києвом.
- FE: прострочену акцію адмінка показує як «завершилась», не підставляє в модалку (інакше будь-яке збереження варіанта отримувало б `PROMO_ENDS_IN_PAST`); `COUPON_NOT_APPLICABLE` мапиться на поле купона; дати форматуються в зоні `Europe/Kyiv` (SSR у UTC давав інший день).

### 5b. Незалежна рецензія (2026-10-04) — 8 знахідок, усі виправлено

- **P1** Ручний `POST /feeds/google-shopping/regenerate` обходив чергу перебудови (прапорець жив у `FeedCronService`) → черга перенесена у `FeedService.requestRerun()` + `finally` у `generate()`.
- **P1** Чекаут видаляв `coupon_code` з запиту, коли локальне прев'ю (з гостьового snapshot-у в localStorage) казало «всі рядки акційні» — чинний купон губився → купон шлеться завжди, сервер вирішує, `400 COUPON_NOT_APPLICABLE` показується під полем.
- **P2** `isPromoActive` за замовчуванням судив серверні дані годинником браузера → hydration mismatch біля хвилини закінчення → дата перевіряється лише з явним `now` (гостьовий `_meta`); вітрина та JSON-LD довіряють одному серверному snapshot. Додаткові виправлення — §5c.
- **P2** `googleDate` обрізав секунди (`12:00/12:00` — Merchant відхиляє) → `YYYY-MM-DDThh:mm:ss+00:00`.
- **P2** Mongo-проєкція повертала `promo_ends_at` без `$ifNull` — legacy-документ без поля втрачав ключ → `$ifNull`; int-spec має фікстуру, вставлену повз Mongoose.
- **P2** JSON-LD архівного варіанта показував акційну ціну, сторінка — регулярну → `onPromo = status !== 'archived' && …`.
- **P2** Адмінський `promoStateOf` ігнорував `0 < sale < price` (1 % від 40 ₴ малювався як акція) → перевірка додана, тест `products.schema.test.ts`.
- **P3** Тести з датами 2027/2030 → 2099; int-spec доповнено фікстурами `tiny` (3 ₴ × 90 %), `edge` (`ends_at == NOW`), `legacy`; формулювання про свіжість у `MERCHANT_FEED.md` пом'якшене до best-effort.
- Свідомо лишено: адмінський `PATCH /orders/:id` з `items` і раніше переоцінював рядки за поточним каталогом — закінчення акції між чекаутом і правкою діє так само, як зміна ціни Prom; оптовий прайс-лист PDF від регулярної ціни.

### 5c. Повторна перевірка — узгодженість snapshot і редагування акції

- `buildProductJsonLd` більше не переоцінює активність за часом клієнта: його ціна та `ListPrice`
  походять із того самого snapshot, що й `PriceTag`. Коли React Query отримує нові дані без акції,
  обидва відображення оновлюються разом. Архівний варіант на обох поверхнях має регулярну ціну.
- Для fallback `priceValidUntil` (+90 днів) серверний route передає серіалізований `renderedAt`.
  Гідратація через північ або кінець акції не змінює JSON-LD. Свіжість кешованої ціни забезпечує
  існуючий purge; сторінка, вже відкрита в браузері, оновлюється під час refetch.
- Модалка бере налаштований відсоток і дату незалежно від `promoStateOf`: якщо дата не минула,
  акція зберігається навіть за нульової ціни або округлення без економії. Зміна ціни може зробити
  її активною. Прострочені поля, як і раніше, не підставляються; явне очищення відсотка прибирає акцію.
- Регресійні тести: повна гідратація `ProductPage` через північ/закінчення акції, спільне оновлення
  видимої ціни та JSON-LD після refetch, збереження налаштованих акцій після зміни ціни в модалці.

## 6. Відхилені альтернативи

- **Записувати акційну ціну в `price`** — зникає за 30 хв від Prom-синку (пам'ять
  `prom-pricing-by-design`), і зникає інформація «було».
- **Акція на рівні товару з успадкуванням** — кожен читач ціни робив би join на товар; кошик і
  замовлення читають варіанти за id без товару.
- **Купон поверх акційної ціни (стекування: −15 % від уже акційної ціни)** — відхилено. Первинне
  рішення «купон не діє на акційні рядки взагалі» переглянуто власником 2026-10-05 на «більша зі
  знижок від регулярної ціни» (§2, рядок «Купони»).
- **`prom_base_price` як «було»** — заборонено TD-0006 рядок 370: це ціна постачальника.

## 7. Перевірка

- BE: `promo-pricing.spec.ts` (усі гілки, округлення), `product-variant-promo.int-spec.ts` (паритет
  JS ↔ Mongo, каталог по ефективній ціні, `countPromosEndedBetween`, масовий запис), оновлені
  spec-и мапперів, сервісу товарів, замовлень (знімок, купон, `COUPON_NOT_APPLICABLE`), кошика,
  фіду (три кейси акції), крону фіду (сигнал), партнерського API; нові spec-и сигналу й крону.
- FE: `price.utils.test.ts`, `PriceTag.test.tsx`, `product-jsonld.utils.test.ts` (4 кейси),
  `ProductPage.test.tsx`, `CatalogProductCard.test.tsx`, `CheckoutPage.test.tsx` (купон лише по
  неакційних; купон шлеться завжди), `PromotionCard.test.tsx`, `VariantModal.test.tsx`,
  `products.schema.test.ts` (`promoStateOf`).
- Руками: акція 15 % на товар із 2+ варіантами → каталог, сторінка, фід (`g:sale_price`), JSON-LD;
  чекаут зі змішаним кошиком і купоном; дата «до» = +2 хв і крон.

## 8. Деплой

BE першим (FE читає нові поля; без акцій усі вони null, фід без `sale_price`), потім FE. Міграції
даних немає. Після деплою — `POST /feeds/google-shopping/regenerate` або чекати години; у Merchant
Center перевірити товар з акцією на відсутність попереджень про розбіжність ціни.
