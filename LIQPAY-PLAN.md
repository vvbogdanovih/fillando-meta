# План: інтеграція оплати LiqPay (ПриватБанк)

## Context

Наразі Fillando підтримує лише офлайн-оплату: `IBAN` (реквізити листом) та `CASH` (при самовивозі). Оплата підтверджується вручну адміном (`PATCH /orders/:id/payment-status`). `LIQPAY`/`MONOPAY` існують у enum, але в UI вимкнені ("Незабаром") — див. `FRD §20`, `ADR-0007`.

Мета — увімкнути **онлайн-оплату LiqPay** з автоматичним підтвердженням:
- Користувач на checkout обирає LiqPay → замовлення створюється у `PENDING` → редірект на сторінку LiqPay → після оплати LiqPay шле server-to-server callback → backend переводить замовлення у `PAID` і надсилає лист.
- **Merchant-ключі (public/private key) керуються через адмінку** (як `payment-details`), а не хардкодяться в env. `private_key` зберігається **зашифрованим** (AES-256-GCM) у БД; ключ дешифрування — в env. Архітектура одразу закладається під обидва провайдери (LiqPay + MonoPay), активний вибирається адміном ("на кого брати платежі").

Рішення користувача: повна реалізація (BE+FE+docs); UX = редірект на сторінку LiqPay; замовлення створюється одразу (`PENDING → PAID` по webhook).

**Ключова технічна деталь LiqPay Checkout API v3:**
- `data = base64(JSON({version:3, public_key, action:'pay', amount, currency:'UAH', description, order_id, result_url, server_url}))`
- `signature = base64(sha1(private_key + data + private_key))`
- Оплата: авто-submit HTML-форми з полями `data`,`signature` на `https://www.liqpay.ua/api/3/checkout`.
- Callback (`server_url`) приходить `application/x-www-form-urlencoded` з тими самими `data`+`signature`; статуси `success`/`sandbox` → оплачено, `failure`/`error` → провал. Джерело правди — саме callback, не `result_url`.

---

## Backend (`repos/fillando-be`)

### 1. Шифрування та env
- `src/common/constants/env.constant.ts` — додати `PAYMENT_ENCRYPTION_KEY: z.string().min(44)` (base64 32-байтного ключа для AES-256-GCM) у `envSchema`, `getParsedEnv()` і `ENV`. Це **єдиний** новий секрет — merchant-ключі живуть у БД.
- Новий `src/common/services/crypto.util.ts` (або `encryption.service.ts`) — `encrypt(plain): string` / `decrypt(cipher): string` на `node:crypto` AES-256-GCM (формат `iv:tag:ciphertext` у base64). Ключ з `ENV.PAYMENT_ENCRYPTION_KEY`. Плюс LiqPay-хелпери: `buildSignature(privateKey, data)`, `verifySignature(privateKey, data, signature)`.

### 2. Модуль `payment-providers` (дзеркалить `payment-details`)
Зразок для копіювання: `src/modules/payment-details/*`, `src/database/mongoose/schemas/payment-details.schema.ts`, `.../repositories/payment-details.repository.ts` (патерн `activate`/`findActive` — одна активна).
- Схема `payment_providers` (`src/database/mongoose/schemas/payment-provider.schema.ts`): `provider` (enum `LIQPAY|MONOPAY`), `label`, `public_key`, `private_key_enc` (зашифрований), `is_active` (default false), `sandbox` (bool). Індекс по `provider`.
- Repository: `findActiveByProvider(provider)`, `activate(id)` — деактивує інших **того самого** провайдера (`updateMany({provider}, {is_active:false})` перед активацією).
- Service: на create/update шифрує `private_key` → `private_key_enc` через crypto util. Метод `getActiveCredentials(provider)` для внутрішнього використання (повертає розшифровані ключі) — **не** через HTTP.
- Controller (усе під `JwtAuthGuard`, admin): CRUD + `activate`, `GET /active/:provider`. У всіх відповідях `private_key` **маскується** (напр. `••••1234`), ніколи не віддається повністю і не логується.
- Enum `PaymentProvider` → `src/common/types/enums.ts`. Endpoints → `endpoints.constant.ts`, docs → `api-operation.constant.ts`/`api-property.constant.ts`.

### 3. Модуль `liqpay`
- `src/modules/liqpay/liqpay.service.ts`:
  - `buildCheckout(orderNumber)` — знаходить order по `order_number`, бере активні LiqPay-креди через `PaymentProvidersService.getActiveCredentials('LIQPAY')`, формує `data`+`signature` (`amount = order.total_price`, `currency:'UAH'`, `order_id = order.order_number`, `result_url = FRONTEND_URL/checkout/success?order=...&payment=LIQPAY`, `server_url = <public-backend>/liqpay/callback`). Повертає `{ data, signature, action_url }`.
  - `handleCallback(data, signature)` — перевіряє підпис активними кредами; декодує `data`; **валідує** `order_id`, `amount`, `currency` проти замовлення; ідемпотентно (якщо вже `PAID` — no-op); мапить статус → `OrderService.updatePaymentStatus(order, PAID/FAILED, txnId)`; на `PAID` надсилає лист-підтвердження.
- `src/modules/liqpay/liqpay.controller.ts`:
  - `POST /liqpay/checkout` (публічний, body `{ order_number }`) → `{ data, signature, action_url }`.
  - `POST /liqpay/callback` (публічний webhook, form-urlencoded `{ data, signature }`) → завжди `200` (LiqPay ретраїть на не-2xx).
- `liqpay.module.ts` імпортує `OrderModule`, `EmailModule`, `PaymentProvidersModule`; реєстрація в `app.module.ts`.
- `src/main.ts` — додати `app.useBodyParser('urlencoded', { extended: true })` (LiqPay callback form-encoded). Raw-body **не** потрібен: підпис рахується над полем `data`, а не над сирим тілом.

### 4. Order flow
- `order.service.ts::create` (рядки ~235-289) — для `PaymentMethod.LIQPAY` **не** слати IBAN/CASH-лист одразу (лист піде на `PAID` з callback). Замовлення створюється як зараз (`PENDING`).
- `updatePaymentStatus` вже існує (`PATCH /orders/:id/payment-status`) — переюзати з `liqpay.service`. Email-темплейт: переюзати `sendOrderIbanConfirmation`/`sendOrderCashConfirmation` або додати `sendOrderPaidConfirmation` у `email.service.ts`.
- Після змін endpoint/DTO — `yarn spec:export` (оновити `openapi.json`).

---

## Frontend (`repos/fillando-fe`)

### 5. Checkout — увімкнути LiqPay
- `src/app/(root)/checkout/checkout.schema.ts` — `payment_method: z.enum(['IBAN','CASH','LIQPAY'])`.
- `.../checkout/checkout.api.ts` — додати `'LIQPAY'` у `CreateOrderPayload.payment_method`; нова `initLiqpayCheckout(order_number)` → `POST /liqpay/checkout`.
- `CheckoutPage.tsx` (рядки ~813-823) — замінити disabled-заглушку LiqPay на активний radio (патерн IBAN/CASH). Доступність гейтити наявністю активного провайдера (публічний `GET /payment-providers/active/LIQPAY`).
- `CheckoutPage.tsx` `orderMutation.onSuccess` (рядки ~302-332) — якщо `payment_method === 'LIQPAY'`: після `clearAfterOrder()` викликати `initLiqpayCheckout`, згенерувати приховану `<form method=POST action=action_url>` з `data`/`signature` і засабмітити (редірект на LiqPay). Для IBAN/CASH — поведінка без змін.
- `success/CheckoutSuccessContent.tsx` — додати повідомлення для `payment === 'LIQPAY'` ("Оплату отримано / обробляється").

### 6. Admin — керування ключами
- Реалізувати наявні заглушки `src/app/admin/payment-details/liqpay/` та `/monopay/` (форми `public_key`, `private_key`, `label`, `sandbox`, toggle активності) поверх нового `payment-providers` API. Зразок форми/списку: `admin/payment-details/_components/PaymentDetailsForm.tsx`, `PaymentDetailsList.tsx`, `payment-details.api.ts`. `private_key` показувати замаскованим, вводити лише при зміні.
- API-роути → `src/common/constants/api-routes.constants.ts`.

---

## Docs (meta-repo)

- **ADR** `docs/adr/0009-online-payment-liqpay.md` (шаблон `docs/templates/adr.md`) — рішення про онлайн-еквайринг через LiqPay з керованими/зашифрованими merchant-ключами; статус `0007` → `Superseded by 0009`; оновити `docs/adr/README.md`.
- **TD** `docs/designs/TD-0001-liqpay-integration.md` (шаблон `docs/templates/technical-design.md`) — архітектура, потоки (checkout/callback), модель `payment_providers`, безпека шифрування.
- **Plan** `docs/plans/plan-0001-liqpay.md` (шаблон `docs/templates/implementation-plan.md`).
- **FRD** `docs/requirements/FRD.md`: §7 таблиця методів (LIQPAY → доступний), §14 (керування провайдерами/ключами), §18 (нова колекція `payment_providers`), §20 (прибрати LiqPay зі списку нереалізованого).
- `docs/architecture/state-machines.md` — оновити примітку payment (авто `PENDING→PAID` через LiqPay callback).
- `docs/glossary.md` — терміни LiqPay / Payment Provider.
- Env-темплейти: `docs/runbooks/env-template.env` та кореневий master `.env` (секція BACKEND) — додати `PAYMENT_ENCRYPTION_KEY`; переконатись, що `scripts/sync-env.sh` рознесе його в `repos/fillando-be/.env`.

---

## Безпека (cross-cutting)
- `private_key` — AES-256-GCM at rest, ключ лише в env, ніколи в логах/відповідях API.
- Callback: обов'язкова перевірка підпису + звірка `amount`/`currency`/`order_id`; ідемпотентність (повторний callback не змінює вже `PAID`).
- Публічний `server_url` має бути доступний ззовні (на проді через Nginx `/api/liqpay/callback`).

## Порядок виконання
1. BE: env + crypto util → `payment-providers` модуль → `liqpay` модуль → order/email → `yarn spec:export`.
2. FE: checkout enable + LiqPay redirect → admin-форми ключів.
3. Docs: ADR/TD/plan + FRD/state-machines/glossary/env-template.

## Верифікація (E2E, LiqPay sandbox)
1. Отримати sandbox public/private key у кабінеті LiqPay; завести їх через адмінку `/admin/payment-details/liqpay`, активувати.
2. `bash scripts/sync-env.sh`; `cd repos/fillando-be && yarn start:dev`; `cd repos/fillando-fe && yarn dev`.
3. Оформити замовлення з LiqPay → перевірити редірект на сторінку LiqPay, оплатити тестовою картою.
4. Для локального callback прокинути публічний URL (ngrok) у `server_url`; підтвердити, що замовлення стало `PAID`, `payment_transaction_id` заповнений, лист надіслано.
5. Негатив: невалідний підпис callback → `FAILED`/ігнор; повторний callback ідемпотентний; неактивний провайдер → LiqPay прихований на checkout.
6. `yarn lint` + `yarn test` (BE), `yarn build` (FE).
