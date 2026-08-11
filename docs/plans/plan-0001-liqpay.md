# Plan-0001 — LiqPay online payment

- **Status:** Done
- **Owner:** Fillando team
- **Date:** 2026-07-23
- **Target:** Online payments milestone
- **Design (TD):** [TD-0001](../designs/TD-0001-liqpay-integration.md)
- **Components:** both

## 1. Objective

Ship card payment via LiqPay: checkout creates a `PENDING` order, redirects to
LiqPay, and a server callback flips it to `PAID`. Merchant keys are managed in
the admin panel and stored encrypted. Done = a sandbox order can be paid
end-to-end and lands as `PAID`.

## 2. Scope

**In scope**
- Backend `payment-providers` (encrypted, admin-managed) and `liqpay` modules.
- Frontend checkout redirect + admin key management (LiqPay & MonoPay).
- Docs: ADR-0009, TD-0001, FRD/state-machines/glossary/env updates.

**Out of scope**
- MonoPay checkout flow (keys can be stored; pay flow not wired).
- Refunds/partial captures.

## 3. Work breakdown

| # | Task | Component | Depends on | Status |
|---|------|-----------|------------|--------|
| 1 | `PAYMENT_ENCRYPTION_KEY` + `PUBLIC_API_URL` env; AES-256-GCM crypto util + LiqPay signature helpers | fillando-be | — | ☑ |
| 2 | `payment-providers` module (schema, repo, DTOs, service, admin controller, endpoints/docs) | fillando-be | 1 | ☑ |
| 3 | `liqpay` module (checkout builder, callback handler, controller, module); urlencoded body parser | fillando-be | 1,2 | ☑ |
| 4 | Order flow: skip immediate email for LIQPAY; `applyGatewayPaymentResult`; paid-confirmation email + template; `yarn spec:export` | fillando-be | 3 | ☑ |
| 5 | Checkout: enable LiqPay option (gated on active provider), redirect via auto-submit form; success page copy | fillando-fe | 2,3 | ☑ |
| 6 | Admin key management pages over `payment-providers` API | fillando-fe | 2 | ☑ |
| 7 | Docs: ADR/TD/plan + FRD/state-machines/glossary/env | meta | — | ☑ |

## 4. Sequencing & milestones

Backend (1→4) lands first so the frontend (5,6) has endpoints and OpenAPI.
Docs (7) alongside. One PR per repo.

## 5. Dependencies & risks

- **Dependencies:** LiqPay sandbox credentials; publicly reachable callback URL
  (`PUBLIC_API_URL`, prod via Nginx `/api`); Resend for the paid email.
- **Risks:**
  - Callback spoofing → mitigated by signature verification + amount/currency
    checks + idempotency.
  - Lost/duplicate callbacks → idempotent `applyGatewayPaymentResult`.
  - Encryption key loss → stored secrets become unreadable; back up
    `PAYMENT_ENCRYPTION_KEY` securely.

## 6. Testing & rollout

- Unit: signature build/verify, encrypt/decrypt round-trip.
- E2E: sandbox order via a tunnel (ngrok) for the callback; assert `PAID`,
  `payment_transaction_id`, and email; negative tests for bad signature, amount
  mismatch, duplicate callback.
- Rollout: backend → frontend; configure sandbox keys in admin, verify, then
  activate a production credential set. No DB migration; rollback = deactivate
  the LiqPay provider (checkout hides the option automatically).

## 7. Open questions

- Refund (`REFUNDED`) automation — deferred.
- MonoPay checkout — separate follow-up.
