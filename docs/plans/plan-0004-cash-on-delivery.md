# Plan-0004 — Накладний платіж (cash on delivery)

- **Status:** In Progress
- **Owner:** Fillando team
- **Date:** 2026-08-23
- **Target:** Checkout payment methods
- **Design (TD):** [TD-0004](../designs/TD-0004-cash-on-delivery.md)
- **Components:** both

## 1. Objective

A customer shipping with Nova Post can pay on pickup. Done = `COD` is selectable on `/checkout` only for `NOVA_POST`/`COURIER`, its selection requires accepting the partial-prepayment condition in a dialog, the pair is enforced on the backend for both `POST /orders` and `PATCH /orders/:id`, the customer gets a dedicated confirmation email, and the method reads «Накладний платіж» in the admin panel, the customer account, the PDF invoice and reports.

## 2. Scope

**In scope**
- `PaymentMethod.COD` in the backend enum and in all three frontend value lists.
- `validatePaymentDeliveryCombination` in `OrderService`, applied on create and on admin update.
- Ukrainian labels: `formatPaymentMethod` (invoice/reports) and both frontend `PAYMENT_METHOD_LABELS`.
- Checkout: availability rule, confirmation dialog, fix of the payment-reset effect, success-page copy.
- Admin: the `COD` option disabled for `PICKUP`, and switching delivery to `PICKUP` dropping an incompatible method.
- Admin «Реквізити оплати»: an informational COD page next to the existing Cash stub, so the sidebar group is not missing the new method.
- A dedicated COD confirmation email template + `EmailService.sendOrderCodConfirmation`.
- `.catch('CASH')` on the customer order page so an unknown method cannot break it.
- Docs: TD-0004, this plan, FRD §7/§9.2/§17.2/§18.8, domain-model, state-machines, glossary, `src/docs/` on the backend.

**Out of scope**
- Storing the prepayment amount, and any minimum cart total for COD.
- Automating `PENDING → PAID` from `DELIVERED` or from the TTN.
- Enforcing `CASH → PICKUP` on the backend (frontend-only today; see TD-0004 §2).
- Two pre-existing frontend nits left untouched: `'CARD'` in `paymentMethodValues` with no backend counterpart, and the three duplicated label dictionaries.

## 3. Work breakdown

| # | Task | Component | Depends on | Status |
|---|------|-----------|------------|--------|
| 1 | `PaymentMethod.COD` in `src/common/types/enums.ts` | fillando-be | — | ☑ |
| 2 | `formatPaymentMethod` → `'Накладний платіж'` (invoice + reports) | fillando-be | 1 | ☑ |
| 3 | `ALLOWED_DELIVERY_BY_PAYMENT` + `validatePaymentDeliveryCombination`, wired into `create()` and into `update()` on the effective pair | fillando-be | 1 | ☑ |
| 4 | `order-cod-confirmation` email template + `EmailService.sendOrderCodConfirmation` (`paymentType: 'Накладний платіж'` on the service email) | fillando-be | 1 | ☑ |
| 5 | COD branch in the `create()` confirmation-email dispatch | fillando-be | 4 | ☑ |
| 6 | Unit tests: COD × {PICKUP → 400, NOVA_POST → pass}, `update()` both directions of the pair | fillando-be | 3 | ☑ |
| 7 | `yarn spec:export` + `src/docs/ORDER_ADMIN_API.md`, `src/docs/DATA_MODELS.md` | fillando-be | 3 | ☑ |
| 8 | `'COD'` in `paymentMethodValues` (admin + profile) and `.catch('CASH')` on the profile schema | fillando-fe | — | ☑ |
| 9 | `PAYMENT_METHOD_LABELS.COD` in both `orders.constants.ts` | fillando-fe | 8 | ☑ |
| 10 | `checkout.schema.ts`: enum, payload union, `superRefine` rule for COD × `PICKUP` | fillando-fe | — | ☑ |
| 11 | `checkout.constants.ts`: `COD_ALLOWED_DELIVERY`, `COD_MODAL` copy, `isPaymentMethodAllowed` | fillando-fe | 10 | ☑ |
| 12 | `CheckoutPage.tsx`: COD option, confirmation dialog with `useLenisModalLock`, revert-on-decline, fixed payment-reset effect | fillando-fe | 11 | ☑ |
| 13 | `CheckoutSuccessContent.tsx`: COD copy | fillando-fe | 10 | ☑ |
| 14 | Admin: `isPaymentMethodAllowed` in `orders.utils.ts`, option disabled for `PICKUP`, delivery change dropping an incompatible method | fillando-fe | 8 | ☑ |
| 15 | Frontend tests: checkout zod rule + helper; jsdom component test of the dialog (agree / decline / `NOVA_POST → COURIER` / `→ PICKUP`); admin helper | fillando-fe | 12,14 | ☑ |
| 16 | Admin «Реквізити оплати»: informational `/admin/payment-details/cod` page + route constant + sidebar entry | fillando-fe | — | ☑ |
| 17 | Docs: TD-0004, this plan, FRD, domain-model, state-machines, glossary | meta | — | ☑ |

## 4. Sequencing & milestones

The **backend merges to `main` first**, the frontend after. COD is a write path: the storefront sends `payment_method: 'COD'` and the backend has to accept it. A backend deployed alone is inert — nothing emits COD, because the old checkout has no such option and the old admin dropdown no such entry — so the window between the two deploys is invisible to users and can be any length. The reverse order breaks order creation outright: checkout would offer «Накладний платіж» and `POST /orders` would 400 on `@IsEnum(PaymentMethod)` for as long as the window lasts.

This is the opposite of [Plan-0003](plan-0003-payment-status-voided.md), and deliberately so: there the backend *emitted* a new value the frontend had to parse (a read path), so the frontend had to know it first. Here the direction is reversed.

The `.catch('CASH')` added in task 8 is belt-and-braces rather than load-bearing under this order — with the backend first, no COD order can exist before the frontend ships.

One PR per repo: meta → `main`, child repos → feature branch off `dev`, PR base switched to `dev` manually.

## 5. Dependencies & risks

- **Dependencies:** none. COD needs no gateway, no credentials, and no Nova Post API call — the integration is directory-lookup only.
- **Risks:**
  - **Deploy order reversed** (frontend to `main` before the backend) → checkout offers COD and every such order 400s on creation. Mitigated by merging the backend PR first; the fix is a backend deploy, not a rollback. Task 8 additionally keeps the customer order page from throwing if an unknown method ever reaches it.
  - **A label map missed** → «Накладний платіж» renders blank or `—`. Mitigated by `Record<PaymentMethod, string>` making it a compile error on the frontend, and by checking the PDF invoice, where a missing case prints `—` silently.
  - **The dialog bypassed by keyboard** → COD selected without the customer seeing the condition. Mitigated by gating on `onChange` and restoring the previous method on decline, rather than intercepting the pointer click; covered by the component test.
  - **Admin breaks the pair** → the backend returns 400 on the effective pair; the UI additionally disables the impossible option so the error is not reachable by normal use.

## 6. Testing & rollout

**Backend:** `yarn test`, `yarn build`, `yarn spec:export`, then against `yarn start:dev`:
- `POST /orders` with `COD` + `NOVA_POST` and with `COD` + `COURIER` → 201, `payment_status: PENDING`, COD email sent;
- the same with `PICKUP` → 400;
- `PATCH /orders/:id {"delivery_method":"PICKUP"}` on a COD order → 400; `PATCH {"payment_method":"COD"}` on a `PICKUP` order → 400;
- `POST /orders/:id/invoice` → «Оплата / Метод: Накладний платіж», not `—`.

**Frontend:** `yarn test`, `yarn tsc --noEmit`, `yarn build`, then `yarn dev` (port 9000):
- `/checkout` with Nova Post delivery → picking «Накладний платіж» opens the dialog; «Скасувати» restores the previous method, «Погоджуюсь» keeps COD;
- switching `NOVA_POST → COURIER` keeps COD; switching to `PICKUP` disables it and falls back to IBAN;
- `/checkout/success?payment=COD` shows the prepayment copy;
- `/profile/orders/:id` and `/admin/orders/:id` read «Накладний платіж»; in the admin edit form the option is disabled under self-pickup;
- `/admin/payment-details/cod` opens from the sidebar and explains the rule; no credentials are stored.

**Rollout:** backend → frontend (see §4). Pushing the feature branches deploys nothing — GitHub Actions deploys each child repo only on push to `main`, so the order matters at the `dev → main` merge, not before. No migration and no backfill — the enum only gains a value and no stored order can hold it. Rollback is reverting both PRs; a COD order created in the meantime needs its method changed by hand.
