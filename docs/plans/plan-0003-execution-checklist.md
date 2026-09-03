# Plan-0003 — чекліст імплементації (робочий файл)

> **Як користуватись.** Це робочий файл виконання [`plan-0003-security-hardening.md`](plan-0003-security-hardening.md) на рівні файлів і змін. Виконуючи — ставити `[x]`, не переписувати текст. PR закривається тільки коли всі його пункти `[x]` і CI-перевірки (тести/`tsc`) зелені. Після мержу PR — оновити `Status` у таблиці §3 plan-0003. Коли всі PR змерджені й задеплоєні — plan-0003 → `Done`, оновити FRD, видалити обидва файли (правило `CONTRIBUTING.md`).
>
> Оглядовий контекст: `~/Desktop/fillando-direction.pdf`. Макет цільового стану: https://claude.ai/code/artifact/d6200740-5fe3-4edc-9461-b4fdf1ad08f0

## 0. Context

Plan-0003 закриває дефекти, що експлуатуються сьогодні: будь-який USER редагує/видаляє каталог, вендорів і S3-медіа; `prom_id`/`vendor_product_sku` витікають на публічну сторінку товару; чернетки в прайсі та sitemap; невдала LiqPay-оплата виглядає як успішна і шле конверсію в Google Ads; кошик чиститься до редіректу на оплату. Усі факти нижче підтверджені читанням коду на `dev` обох репо 2026-09-03 (чисті, `↑0 ↓0`, тести зелені: BE 57/57, FE 36/36; BE lint — 258 errors базлайну, гейта немає).

Гілки: кожен PR — `feature/*` від `dev` у відповідному child-репо; база PR на GitHub → `dev` (перемикати вручну, default = `main`). Один PR = один репо.

**Рішення, зафіксовані при плануванні (не переспитувати):**

1. Задача 8: `GET /products/:id/variants` і `/:variantId` закриваються під ADMIN замість allowlist-проєкції — їх використовує тільки адмінка (`VariantsSection.tsx:46`, `VariantModal.tsx`), і їй **потрібні** `prom_id`/`vendor_product_sku` для редагування. Проєкція — лише для `by-slug`.
2. Задача 17: токен lookup-у — stateless HMAC від `order_number` (ключ `PAYMENT_ENCRYPTION_KEY`), без нового поля в схемі (план: «схема не змінюється, міграцій немає»).
3. Задача 20 (власник, 03.09): конверсія «лише на PAID» стосується **LiqPay**; COD/IBAN/CASH — конверсія при оформленні, як зараз.
4. §7 plan-0003 (власник, 03.09): `GET /products/price-sheet` лишається публічним як є (точні залишки). Для price-sheet — тільки задачі 9 і 15.
5. Задача 14: SSR (`serverFetch`, `sitemap.ts`) не ходить у жоден throttled ендпоінт (price-sheet — client-side через `httpService`). `X-Internal-Token` — мінімальний `skipIf`, без глобального guard-а; FE-частина не потрібна зараз.

**Ключові факти з коду:**

- `main.ts`: немає глобального prefix/guard-ів/interceptor-ів; `trust proxy 1`; `ValidationPipe({transform, whitelist})`. Nest 11 / Express. CLAUDE.md BE помилково каже про `/api` prefix — його додає лише nginx.
- Серіалізації відповідей немає — контроль полів тільки через `$project`/мапери.
- Тести: 4 spec-файли, чисті unit з `new Service(mocks as never)`; `@nestjs/testing` і `supertest` у devDeps, не використовуються. Jest `rootDir: src`, `testRegex .spec.ts$`, `test/jest.setup.ts` сідить env.
- Еталон guard-ів — `payment-details.controller.ts` (коміт `7670958`): `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` між HTTP-декоратором і `@ApiOperation`, плюс оновлення `src/docs/` у тому ж PR.
- FE отримує з BE тільки `message` + `status` (`http.service.ts:46-48`); купонні помилки при створенні — `'Invalid coupon code'` / `'Coupon is expired'` (`order.service.ts:215,218`).
- `CheckoutPage.tsx:172-176`: ефект `displayItems.length === 0 → router.replace(CATALOG)` після `clearAfterOrder()` зриває редірект на LiqPay (гонка з `form.submit()`) — існує сьогодні.
- LiqPay `result_url` = `${FRONTEND_URL}/checkout/success?order=FO-…&payment=LIQPAY` (`liqpay.service.ts:53`) — без total, однаковий для успіху/відмови.

---

## 1. Перед стартом (мета-репо, один docs-коміт)

- [x] Закомітити застейджені док-файли: TD-0005/0006/0007, plan-0003/0004, TD-0002 → Approved, README-и (`docs: add TD-0005..0007, plan-0003/0004; approve TD-0002`)
- [x] `docs/plans/plan-0003-security-hardening.md` §7 — записати рішення власника від 2026-09-03: price-sheet лишається публічним як є
- [x] Пам'ять: рішення про price-sheet; черга робіт (Plan-0003 → Plan-0004 → Фаза 5 → TD-0007); питання TD-0006/TD-0007 свідомо відкладені до жовтня
- [ ] Відновити кореневий `.env` мета-репо з `docs/runbooks/env-template.env` (потрібен для `sync-env.sh`/`validate-env.sh`; для PR-1 не блокує)

---

## 2. PR-1 (be) — `feature/rbac-admin-write-endpoints` — задачі 1–7 · реліз того ж дня

### Код
- [x] `src/common/decorators/roles.decorator.ts` — `(...roles: Role[])`, імпорт `Role` з `src/common/types/enums` (задача 4)
- [x] `src/common/guards/roles.guard.ts` — `getAllAndOverride<Role[]>`; `!requiredRoles?.length → return false` (default-deny); `const user = req.user as JWTPayload | undefined; if (!user?.role) return false` (задача 5)
- [x] Перевірити, що всі наявні `@UseGuards(..., RolesGuard)` мають `@Roles` (orders, users, categories, discount-coupons, payment-details, payment-providers, prom, nova-post, wholesale-inquiries)
- [x] `src/modules/product/product.controller.ts` — `VALIDATE`(:104), `CREATE`(:111), `POST VARIANTS`(:130), `PATCH VARIANT`(:137), `DELETE VARIANT`(:148), `PATCH_VARIANT_IMAGES`(:155), `UPDATE`(:166), `DELETE`(:173): `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`; прибрати коментар :75-77 «unlike the write endpoints below» (задача 1)
- [x] `src/modules/vendor/vendor.controller.ts:33-52` — те саме на `CREATE/UPDATE/DELETE`; додати імпорти `Roles`, `RolesGuard`, `Role` (задача 2)
- [x] `src/modules/upload/upload.controller.ts:13` — class-level `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (задача 3; єдиний FE-споживач `/upload/*` — адмінка товарів)

### Тести (задача 6)
- [x] `src/common/testing/rbac-harness.ts` — `createRbacApp({ controllers, providers })`: `Test.createTestingModule`, `overrideGuard(JwtAuthGuard)` фейком (`HeaderRoleAuthGuard`), що читає заголовок `x-test-role` → `req.user = { id, email, name, role }`, а без заголовка кидає 401; хелпер `send(app, method, path, { role, body })`; повертає `INestApplication` для `supertest`. `RolesGuard` справжній
- [x] `src/modules/product/product.controller.rbac.spec.ts` — `it.each` по кожному write-ендпоінту: без заголовка → 401, `USER` → 403, `ADMIN` → 200/201 (+ сервіс викликано рівно раз); публічні `GET /products/catalog`, `/by-slug/x`, `/price-sheet` без ролі → 200
- [x] `src/modules/vendor/vendor.controller.rbac.spec.ts` — аналогічно для 3 write-ендпоінтів; `GET /vendors` публічний → 200
- [x] `src/modules/upload/upload.controller.rbac.spec.ts` — 3 ендпоінти: USER → 403, ADMIN → 200/201
- [x] `src/common/guards/roles.guard.spec.ts` — без метаданих → false; `user` undefined → false; `USER` vs `[ADMIN]` → false; `ADMIN` → true
- [x] `yarn test` зелений; `yarn lint` — не більше 258 errors базлайну

### Доки (задача 7)
- [x] `src/docs/RBAC.md` — «Current State» → застосовано до Product/Vendor/Upload; таблицю «Enforced» доповнити (products write, vendors write, upload, users, discount-coupons, payment-providers, wholesale, nova-post sync); секцію «Planned» видалити; правило default-deny
- [x] `src/docs/todo/AUDIT_CRITICAL.md` #3 → Fixed (обрано role-check, не ownership); `src/docs/TODO.md` — статус #3; `src/docs/todo/README.md` — прибрати з «Негайно»
- [x] `src/docs/API_AND_SWAGGER.md` §4 — прибрати «RolesGuard not yet applied to any endpoint»
- [x] `yarn spec:export`
- [ ] PR → `dev` — гілка `feature/rbac-admin-write-endpoints` запушена (коміт afd59c1), PR відкрити: https://github.com/vvbogdanovih/fillando-be/pull/new/feature/rbac-admin-write-endpoints (база → `dev`); після мержу — деплой; ручна перевірка: USER-cookie `PATCH /products/:id` → 403; адмінка створює товар → 201
- [ ] plan-0003 §3: задачі 1–7 → ☑

---

## 3. PR-2 (be) — `feature/public-projection-hardening` — задачі 8–12 · після PR-1

### Код
- [x] `src/modules/product/product-public.mappers.ts` — `toPublicVariant(variant)` з allowlist `id, name, slug, sku, price, price_updated_at, stock, images, v_value, status`; експорт `PUBLIC_VARIANT_FIELDS` (задача 8)
- [x] `src/database/mongoose/repositories/product-variant.repository.ts` `findVariantWithProduct` (:89-103) — використати `toPublicVariant`; у `findOne({ slug })` (:56) додати `status: ProductStatus.ACTIVE` (draft → 404 на FE через `notFound()`)
- [x] `product.controller.ts:118-128` — `GET /products/:id/variants` і `/:variantId` → `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (рішення 1)
- [x] `product.service.ts:267-274` `getVariant` — `Types.ObjectId.isValid` → `NotFoundException` замість `BSONError` 500
- [x] `findPriceSheet` (:218-297) — першою стадією `{ $match: { status: ProductStatus.ACTIVE } }`; з `$project` (:269-284) прибрати `vendor_product_sku`, `prom_id`; з regex-`$match` (:242) прибрати `{ vendor_product_sku: rx }`; винести `$project` у константу `PRICE_SHEET_PUBLIC_PROJECTION` (задача 9)
- [x] `product.service.ts` `PriceSheetRaw` (:22-36) — прибрати `vendor_product_sku`, `prom_id`
- [x] `findAllSlugs` (:44-49) — `.find({ status: ProductStatus.ACTIVE }, …)` (задача 10)
- [x] `product.controller.ts:39-43` `GET /products` → `JwtAuthGuard, RolesGuard` + `ADMIN`; `api-operation.constant.ts:107-110` — «Admin-only, unpaginated list» (задача 11; FE-споживач лише `admin/products/Products.tsx:36`)

### Тести (задача 12)
- [x] `src/modules/product/product-public.mappers.spec.ts` — `toPublicVariant` над фікстурою з усіма полями схеми → `Object.keys(result).sort()` дорівнює allowlist; `not.toHaveProperty('prom_id' | 'vendor_product_sku' | 'prom_base_price' | 'prom_discount_ratio' | 'prom_discount_seen_at')`
- [x] `PRICE_SHEET_PUBLIC_PROJECTION` — `toMatchInlineSnapshot` ключів
- [x] `product.controller.rbac.spec.ts` — додати `GET /products`, `GET /products/:id/variants`, `GET /products/:id/variants/:variantId`
- [x] `product-variant.repository.int-spec.ts` — інтеграційний тест на реальній Mongo (`yarn test:integration`): only-active у slugs/count/price-sheet/by-slug, жодного prom-поля в payload, vendor SKU не шукається, admin `findByProductId` повний
- [x] Ride-along з ревʼю PR-2 (винесено в **PR-4b** `feature/order-customer-projection` від PR-4, коміт ce27979, запушено; PR: https://github.com/vvbogdanovih/fillando-be/pull/new/feature/order-customer-projection, база → `feature/order-payment-lookup`): `POST /orders` і `GET /orders/me*` без `items[].vendor_sku`; DRAFT/ARCHIVED варіанти → 400 у замовленні, 409/removed_items у кошику; тести order/cart
- [ ] `yarn test` зелений

### Доки
- [x] `src/docs/PRICE_SHEET.md` — фільтр `active`, прибрані поля; `src/docs/DATA_MODELS.md:229` — «internal, never exposed publicly»; `src/docs/API_AND_SWAGGER.md` §5 — `GET /products` admin
- [x] `yarn spec:export`
- [ ] PR → `dev` — гілка `feature/public-projection-hardening` запушена (коміт 0f46afd, stacked на PR-1), PR відкрити: https://github.com/vvbogdanovih/fillando-be/pull/new/feature/public-projection-hardening (база → `feature/rbac-admin-write-endpoints` або `dev` після мержу PR-1); ручна перевірка після деплою: `by-slug` без prom-полів, draft-slug → 404, `variants/slugs` без draft, `price-sheet?q=<vendor sku>` → порожньо
- [ ] plan-0003 §3: задачі 8–12 → ☑

---

## 4. PR-3 (be) — `feature/rate-limiting` — задачі 13–15 · після PR-2; FE-задача 16 у проді **раніше або разом**

### Код
- [x] `yarn add @nestjs/throttler` (v6 для Nest 11; `ttl` у мс) (задача 13)
- [x] `src/common/constants/env.constant.ts` — `INTERNAL_API_TOKEN: z.string().min(32).optional()` у 3 місцях (schema / safeParse-літерал / `ENV`) (задача 14)
- [x] `src/common/guards/internal-request.util.ts` — `isInternalRequest(ctx)`: `ENV.INTERNAL_API_TOKEN` заданий **і** `timingSafeEqual` із заголовком `x-internal-token` (перевірка довжини перед порівнянням)
- [x] `src/app.module.ts` — `ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }], skipIf: isInternalRequest })`; **без** `APP_GUARD`
- [x] Ліміти (задача 15) — `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit, ttl: 60_000 } })`:
  - [x] `auth.controller.ts:70,88` `POST /auth/login`, `POST /auth/register` — 10/хв
  - [x] `auth.controller.ts:135` `POST /auth/refresh` — 30/хв
  - [x] `product.controller.ts:69` `GET /products/price-sheet` — 20/хв
  - [x] `discount-coupon.controller.ts:44` `POST /discount-coupons/validate` — 20/хв
  - [x] `order.controller.ts:39` `POST /orders` — 10/хв (`@UseGuards(ThrottlerGuard, OptionalJwtAuthGuard)`)
  - [x] `liqpay.controller.ts:13` `POST /liqpay/checkout` — 10/хв (ride-along: публічний оракул номерів замовлень)
  - [ ] `GET /orders/lookup/:orderNumber` — 30/хв (додає той PR — PR-3 чи PR-4 — що мерджиться другим)
- [x] `main.ts:23-30` — `Retry-After` у `exposedHeaders` CORS

### Тести
- [x] `src/common/guards/internal-request.util.spec.ts` — токен не заданий → false; збіг → true; різна довжина → false без throw
- [x] `src/modules/discount-coupon/discount-coupon.controller.throttle.spec.ts` (замість auth — той самий guard, найдешевший контролер для харнесу): 21-й запит → 429 + `Retry-After`; з валідним `x-internal-token` → не 429; хибний токен → 429. Харнес `createRbacApp` отримав `imports` (за замовчуванням дозвільний `ThrottlerModule`)
- [x] `yarn test` зелений (175)

### Доки / env
- [x] `src/docs/API_AND_SWAGGER.md` — розділ «Rate limiting» (таблиця лімітів, як додати новий, `X-Internal-Token`)
- [x] `src/docs/todo/AUDIT_HIGH.md` #6, #9, #12 → Fixed з фактичними числами
- [x] Мета-репо `docs/runbooks/env-template.env` — `INTERNAL_API_TOKEN` у COMMON-секції (окремий docs-коміт)
- [ ] `.env.prod` BE на сервері — `INTERNAL_API_TOKEN` (optional; можна пізніше)
- [ ] Переконатись, що задача 16 (PR-5 або міні-PR `fix/server-fetch-throws`) **уже в проді** — і лише тоді деплоїти PR-3
- [x] Локальний smoke на `dist/main` + тестова Mongo: 11-й `POST /auth/login` → 429 + `Retry-After: 60`; 25× `/discount-coupons/validate` з `x-internal-token` → усі 201; 30× `/products/catalog` → 0×429
- [ ] Гілка `feature/rate-limiting` запушена (stacked на PR-2), PR: https://github.com/vvbogdanovih/fillando-be/pull/new/feature/rate-limiting; після деплою перевірити логи BE — немає 429 для SSR
- [ ] plan-0003 §3: задачі 13–15 → ☑

---

## 5. PR-4 (be) — `feature/order-payment-lookup` — задачі 17–18 · паралельно з PR-2/3

### Код
- [x] `src/common/services/crypto.util.ts` — `orderAccessToken(orderNumber)` = `createHmac('sha256', ENV.PAYMENT_ENCRYPTION_KEY).update(`order-lookup:${orderNumber}`).digest('hex').slice(0, 32)`; `verifyOrderAccessToken(orderNumber, token)` через `timingSafeEqual` з перевіркою довжини
- [x] `src/common/constants/endpoints.constant.ts` ORDERS — `LOOKUP: '/lookup/:orderNumber'`
- [x] `src/modules/order/dto/order-lookup-query.dto.ts` — `token: @Matches(/^[a-f0-9]{32}$/)`; param `orderNumber` — `@Matches(/^FO-\d{7}$/)`
- [x] `src/modules/order/dto/order-payment-status-response.dto.ts` — Swagger-shape `{ order_number, payment_method, payment_status, total_price }`
- [x] `order.service.ts` — `getPaymentStatusPublic(orderNumber, token)`: невірний токен → **404** (не 403); `findByNumber`; повернути рівно 4 поля
- [x] `order.service.ts` `create(...)` — до відповіді додати `payment_access_token: orderAccessToken(order_number)` **лише** для `payment_method === LIQPAY`
- [x] `order.controller.ts` — `@Get(ENDPOINTS.ORDERS.LOOKUP)` публічний, оголошений **перед** `GET_BY_ID`; `API_OPERATION.ORDERS.LOOKUP` у `api-operation.constant.ts` (~:257)
- [x] `liqpay.service.ts:53` — `result_url` += `&token=${orderAccessToken(order.order_number)}`
- [x] `liqpay.service.ts` `buildCheckout` — ride-along: `payment_status === PAID → BadRequestException('Order is already paid')`; за ревʼю також `CANCELLED`/`VOIDED`/`REFUNDED → 400 'Order is cancelled'`; `app.module.ts` — pino `redact` для `req.query.token` + `[redacted]` в url; `CreateOrderResponseDto` з `payment_access_token` для Swagger

### Тести
- [x] `src/common/services/crypto.util.spec.ts` — детермінованість; різні номери → різні токени; `verify` false на підміну / іншу довжину
- [x] `order.service.spec.ts` — `describe('getPaymentStatusPublic')`: невірний токен → `NotFoundException`, `findByOrderNumber` не викликано; вірний → рівно 4 ключі
- [x] `src/modules/liqpay/liqpay.service.spec.ts` (новий, стиль `order.service.spec.ts`) — `result_url` містить `token=`; PAID → BadRequest
- [x] `yarn test` зелений

### Доки (задача 18)
- [x] Новий `src/docs/LIQPAY_FLOW.md` — checkout → redirect → callback → `applyGatewayPaymentResult`; чому `result_url` не є джерелом правди; lookup + HMAC-токен; посилання на TD-0001 і `state-machines.md`
- [x] `API_AND_SWAGGER.md` §5 і `ORDER_ADMIN_API.md:83` — згадати LIQPAY_FLOW
- [x] `yarn spec:export`
- [ ] PR → `dev`; після деплою: `GET /orders/lookup/FO-0000001?token=bad` → 404, з правильним → 4 поля
- [ ] plan-0003 §3: задачі 17–18 → ☑

---

## 6. PR-5 (fe) — `feature/checkout-payment-funnel` — задачі 16, 19–22 (+ FE-хвіст PR-2) · після мержу PR-4

### Задача 16 — `serverFetch` кидає
- [x] `src/common/utils/server-fetch.utils.ts` — одна функція: `404 → null`, інший `!ok` → `throw new Error('Upstream ${status} for ${path}')`, network error — кидати; опціональний 2-й аргумент `init`; `serverFetchOrThrow` видалити (2 виклики в `products/[slug]/page.tsx:23,52` → `serverFetch`)
- [x] `[category]/page.tsx:17` `generateMetadata` — try/catch → базові метадані **без** `noindex` при outage
- [x] Перевірити call sites `Home.tsx:15,21`, `[category]/page.tsx:43,56`, `search/page.tsx:27` — `null` тепер означає лише 404
- [x] `src/app/sitemap.ts:11-12,62` — через `serverFetch(path, { next: { revalidate: 0 } })` замість `.then(r => r.json())` (інакше 429 кешується `unstable_cache` на добу)
- [x] `src/common/utils/server-fetch.utils.test.ts` — `vi.stubGlobal('fetch')`: 200 → json; 404 → null; 429/500 → throws; reject → throws

### Задачі 19–20 — сторінка успіху
- [x] `api-routes.constants.ts` ORDERS — `LOOKUP: (n) => `/orders/lookup/${n}``
- [x] `checkout.api.schemas.ts` — `orderPaymentStatusSchema` (`payment_status` через `paymentStatusValues` з `profile/orders/orders.schema.ts`); `createOrderResponseSchema` + `payment_access_token: z.string().optional()`
- [x] `checkout.api.ts` — `fetchOrderPaymentStatus(orderNumber, token)` (`params: { token }`, `skipErrorToast: true`)
- [x] `checkout/liqpay.utils.ts` — винести `submitLiqpayForm` (з `CheckoutPage.tsx:74-92`, + `form.remove()`) і `startLiqpayCheckout(orderNumber)`
- [x] `success/CheckoutSuccessContent.tsx` — гілка LIQPAY: читає `token`; `useQuery` з `refetchInterval` 3 с поки `PENDING`, стоп через ~60 с; стани `PAID` → «Дякуємо» + конверсія (`value: total_price, currency: 'UAH', transaction_id`); `FAILED`/`VOIDED` → «Оплата не пройшла» + «Спробувати ще раз» (`startLiqpayCheckout`); `PENDING` → «Очікуємо підтвердження…» без конверсії; без `token`/помилка → нейтральний текст без конверсії. Non-LiqPay — конверсія при монтуванні, як зараз (рішення 3)
- [x] `success/CheckoutSuccessContent.test.tsx` — моки `next/navigation` (`useSearchParams`), `checkout.api`, `@/common/lib/gtag`: LIQPAY+PAID → gtag 1 раз; LIQPAY+FAILED → 0 + кнопка; LIQPAY+PENDING → 0; COD → 1

### Задача 21 — `onError` створення замовлення (`CheckoutPage.tsx:402-408`)
- [x] `isCouponError = /coupon/i.test(err.message)` → лише тоді `setError('coupon_code', …)` + `setFocus('coupon_code')`; мапа `'Invalid coupon code'` → «Купон не знайдено або неактивний», `'Coupon is expired'` → «Термін дії купона минув»
- [x] Інакше — лише `toast.error` з локалізованим fallback; `status === 429` → «Занадто багато спроб, зачекайте хвилину»
- [x] `handleSubmit(onSubmit, onInvalid)` — `onInvalid` скролить до `[aria-invalid="true"]` для полів без `ref` (Radio / Nova Post селекти)

### Задача 22 — порядок `clearAfterOrder` / LiqPay (`CheckoutPage.tsx:370-401`)
- [x] `orderPlacedRef = useRef(false)`; ефект `:172-176` → `&& !orderPlacedRef.current`; ранній return `:427` теж враховує ref
- [x] Знайдено e2e: hard-load `/checkout` з гостьовим кошиком редіректив у каталог (ефект спрацьовував до `persist.rehydrate()` у `Providers`) → гейт `cartHydrated` через `useCartStore.persist?.hasHydrated()/onFinishHydration` (SSR-safe: на сервері `persist` undefined)
- [x] Playwright e2e проти mock-API (`e2e/mock-api.mjs` на 9001, `playwright.config.ts`, `yarn test:e2e`): success-page (PAID/FAILED+retry→sink/PENDING/404/no token/COD), checkout-errors (stock → toast, coupon → під полем, hard-load кошика), liqpay-redirect (order → checkout → sink, кошик порожній після) — 10/10
- [x] `isRedirecting` state → `pending = isSubmitting || orderMutation.isPending || isRedirecting`
- [x] `onSuccess`: `orderPlacedRef.current = true; setIsRedirecting(true)`; LIQPAY: `try { initLiqpayCheckout } catch { toast; await clearAfterOrder(); router.push(success?order=&payment=LIQPAY&token=payment_access_token); return }`; `await clearAfterOrder()` **після** успішного init → `submitLiqpayForm`. Non-LiqPay — як зараз
- [x] `CheckoutPage.test.tsx` — (a) COD сабміт → `createOrder`, `clearAfterOrder`, `push` на success; (b) LIQPAY + `initLiqpayCheckout` reject → `clearAfterOrder` після, toast, `push` з `token` (мок `fetchActivePaymentProvider` → `{}`); (c) reject `'Invalid coupon code'` → помилка під `coupon_code`; reject `'Out of stock'` → лише toast

### FE-хвіст PR-2
- [x] `[category]/catalog.api.ts:32` — прибрати `vendor_product_sku` з типу `ProductDetailData.variant`

### Завершення
- [x] `npx tsc --noEmit` і `yarn test` зелені
- [x] `CLAUDE.md` (fe) — абзац «Checkout / LiqPay» (порядок clear→redirect, lookup, конверсія лише на PAID); `docs/http-service.md` — семантика `serverFetch`
- [ ] PR → `dev` — гілка `feature/checkout-payment-funnel` запушена (коміт 8de8174), PR: https://github.com/vvbogdanovih/fillando-fe/pull/new/feature/checkout-payment-funnel (база → `dev`); ручні LiqPay-сценарії в sandbox: успіх → «Дякуємо» + 1 конверсія в `dataLayer`; відхилена картка → «Оплата не пройшла», 0 конверсій; закрите вікно → PENDING, поллінг, 0 конверсій; збій `initLiqpayCheckout` → toast + success з кнопкою «Оплатити»
- [ ] plan-0003 §3: задачі 16, 19–22 → ☑

---

## 7. PR-6 (fe) — `chore/compose-google-ads-build-args` — задача 23 · незалежний

- [x] `docker-compose.prod.yml:6-12` — `NEXT_PUBLIC_GOOGLE_ADS_ID: AW-18332229942`, `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION: AW-18332229942/vho6CLCit9McELbCvqVE` (ARG-и в `Dockerfile.prod:12-13,19-20` уже є)
- [x] `.dockerignore` — `.env*`, `node_modules`, `.next` (окремим комітом; сьогодні `COPY . .` тягне локальний `.env`)
- [ ] PR → `dev`
- [ ] plan-0003 §3: задача 23 → ☑

---

## 8. Послідовність і деплой

```
PR-1 ──► PR-2 ──► PR-3 (be)          PR-6 (fe) — будь-коли
PR-4 (be, паралельно з PR-2/3) ──► PR-5 (fe)
```

- [ ] PR-1 задеплоєно того ж дня
- [ ] Задача 16 у проді **до** задачі 15 (якщо PR-5 відстає — міні-PR `fix/server-fetch-throws`)
- [ ] PR-4 у проді до PR-5 (старі `result_url` без `token` → нейтральний стан, без конверсії — безпечно)
- [ ] `dev → main` реліз; після кожного BE-релізу `openapi.json` актуальний
- [ ] Усі 23 задачі ☑ → plan-0003 `Status: Done`; оновити `docs/requirements/FRD.md` (RBAC, rate limiting, lookup статусу оплати, LiqPay-воронка); видалити plan-0003 і цей чекліст
