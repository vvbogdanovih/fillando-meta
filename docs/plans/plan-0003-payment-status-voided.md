# Plan-0003 — Payment status `VOIDED` for cancelled orders

- **Status:** In Progress
- **Owner:** Fillando team
- **Date:** 2026-08-19
- **Target:** Orders housekeeping
- **Design (TD):** [TD-0003](../designs/TD-0003-order-cancellation-payment-status.md)
- **Components:** both

## 1. Objective

Cancelling an unpaid order must leave it reading «Скасовано» instead of «Очікує оплату», everywhere it is shown. Done = `PATCH /orders/:id/status` with `CANCELLED` sets `payment_status = VOIDED`, all six frontend surfaces plus the PDF invoice and reports show «Скасовано», existing cancelled orders are backfilled, and a late LiqPay callback can no longer email the customer "payment received".

## 2. Scope

**In scope**
- `PaymentStatus.VOIDED` in the backend enum and both frontend zod schemas.
- Cross-machine rule in `updateOrderStatus`, extracted as a pure, unit-tested function.
- Guard in `applyGatewayPaymentResult` for callbacks landing on cancelled orders.
- De-duplicating `formatPaymentStatus` across the email templates and invoice.
- Ukrainian labels + admin badge classes + refund hint in the admin panel.
- One-off backfill of existing cancelled orders.
- Docs: TD-0003, this plan, state-machines, FRD, glossary.

**Out of scope**
- Refund automation (`REFUNDED`) — still manual.
- General `order_status` transition validation.
- Two pre-existing frontend nits found on the way: payment status rendered twice on the customer order page, and `'CARD'` in `paymentMethodValues` with no backend counterpart.

## 3. Work breakdown

| # | Task | Component | Depends on | Status |
|---|------|-----------|------------|--------|
| 1 | Docs: TD-0003, this plan, `state-machines.md` cross-machine rule, FRD §9/§18.8 enums (+ missing `COMPLETED`), glossary term | meta | — | ☑ |
| 2 | Add `'VOIDED'` to `paymentStatusValues` in both `orders.schema.ts` (profile + admin) | fillando-fe | — | ☑ |
| 3 | `PAYMENT_STATUS_LABELS.VOIDED = 'Скасовано'` in both `orders.constants.ts`; `PAYMENT_STATUS_CLASSES.VOIDED` (neutral grey) in admin | fillando-fe | 2 | ☑ |
| 4 | Verify status filters render from `paymentStatusValues` and are not hardcoded (profile `Orders.tsx`, admin `Orders.tsx`, `ReportModal.tsx`) | fillando-fe | 2 | ☑ |
| 5 | Admin refund hint under the payment-status dropdown when `order_status === CANCELLED && payment_status === PAID` | fillando-fe | 3 | ☑ |
| 6 | `PaymentStatus.VOIDED` in `src/common/types/enums.ts` | fillando-be | — | ☑ |
| 7 | `resolvePaymentStatusOnOrderStatusChange` + read-modify-write `updateOrderStatus` | fillando-be | 6 | ☑ |
| 8 | Cancelled-order guard in `applyGatewayPaymentResult` + admin service email instead of the customer paid email | fillando-be | 6 | ☑ |
| 9 | `formatPaymentStatus`: add `VOIDED → 'Скасовано'` and replace the four copy-pasted duplicates in email templates with imports | fillando-be | 6 | ☑ |
| 10 | Swagger `api-property` text + `yarn spec:export`; update `src/docs/` if an order flow is documented there | fillando-be | 7,8 | ☑ |
| 11 | Unit tests: four branches of the decision function; `applyGatewayPaymentResult` on a cancelled order asserts no customer email | fillando-be | 7,8 | ☑ |
| 12 | Backfill script for existing cancelled orders | fillando-be | 6 | ☑ |

**Status note:** all 12 tasks are implemented and committed on the
`feat/payment-status-voided` branch of each child repo. What remains is merging,
deploying (frontend first) and running the backfill — see §6.

## 4. Sequencing & milestones

Docs (1) first, then **frontend (2–5) before backend (6–11)** — the reverse of the usual order. `payment_status` is parsed by a zod `z.enum` on the frontend, so a backend that emits `VOIDED` to an older frontend breaks the order pages outright. A frontend that knows `VOIDED` works fine against a backend that never sends it.

Backfill (12) runs only after the backend is deployed. One PR per repo: meta → `main`, child repos → feature branch off `dev`, PR base switched to `dev` manually.

## 5. Dependencies & risks

- **Dependencies:** none external. LiqPay sandbox needed only to verify the callback guard.
- **Risks:**
  - **Deploy order reversed** → order pages break on zod parse. Mitigated by shipping the frontend first; the fix is a frontend deploy, not a rollback.
  - **A label map missed** → the badge renders empty. Mitigated by task 9 collapsing the five backend copies into one helper, and by checking the PDF invoice and report during verification.
  - **Backfill too broad** → run `countDocuments` with the same filter first and record the number in the PR description; the filter touches only `CANCELLED` orders in `PENDING`/`FAILED`.
  - **Money received on a cancelled order goes unnoticed** → the callback still records `PAID` and emails the admin; it is never silently dropped.

## 6. Testing & rollout

**Backend:** `yarn lint`, `yarn test`, `yarn build`, then against `yarn start:dev`:
- create a CASH order → `PATCH /orders/:id/status {"order_status":"CANCELLED"}` → `payment_status === 'VOIDED'`;
- move it back to `CONFIRMED` → `payment_status === 'PENDING'`;
- set `PAID` manually, then cancel → stays `PAID`, `logger.warn` about the manual refund;
- LiqPay sandbox: cancel before the callback, then `POST /liqpay/callback` with `status: sandbox` → `PAID` + `payment_transaction_id`, no customer email, admin service email sent;
- same with `status: failure` → stays `VOIDED`.

**Frontend:** `yarn dev` (port 9000) — on `/profile/orders`, `/profile/orders/:id`, `/admin/orders`, `/admin/orders/:id` a cancelled unpaid order shows «Скасовано»; filtering by «Скасовано» returns it and «Очікує оплату» does not; a cancelled paid order shows the refund hint.

**End to end:** generate the PDF invoice and an order report for a cancelled order — both must read «Скасовано», not blank and not «Очікує оплату».

**Rollout:** frontend → backend → backfill. Verify with `countDocuments({order_status:'CANCELLED', payment_status:{$in:['PENDING','FAILED']}})` before (record the number) and after (expect `0`).

## 7. Open questions

- Whether cancelled-but-paid orders need a dedicated "pending refunds" view in the admin panel — deferred; the inline hint is enough at current volume.
