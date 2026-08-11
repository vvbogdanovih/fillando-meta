# 0009 — Online payment via LiqPay

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** Fillando team

## Context

[ADR-0007](0007-payment-flow.md) established manual IBAN bank-transfer payment
with admin-side reconciliation. Customers increasingly expect to pay by card
online at checkout, and manual confirmation does not scale. Fillando operates
under different merchant accounts (ФОП) and needs to control which account
receives payments without redeploying — including support for more than one
provider (LiqPay now, MonoPay later).

## Decision

Add **online card acquiring via LiqPay** (PrivatBank) alongside the existing
IBAN/CASH methods.

- Checkout creates the order as `PENDING`, then redirects the browser to the
  **LiqPay hosted checkout page** (auto-submitted `data` + `signature` form).
  No card data touches our servers → no PCI scope.
- LiqPay confirms payment through a **server-to-server callback** which is the
  source of truth: on success the order flips to `PAID` automatically and a
  paid-confirmation email is sent. The browser `result_url` only shows a status
  page.
- **Merchant credentials are managed in the admin panel** (not hard-coded in
  env), one active credential set per provider (mirrors "Реквізити оплати").
  The `private_key` is stored **encrypted (AES-256-GCM)** in MongoDB; the
  encryption key is derived from a single env secret (`PAYMENT_ENCRYPTION_KEY`)
  and never leaves the server. Provider secrets are never returned by the API.
- The data model is provider-generic (`LIQPAY` | `MONOPAY`) so MonoPay can be
  added later without schema changes; only LiqPay checkout is wired now.

## Consequences

- Automatic payment confirmation; less manual admin work than IBAN.
- New secret to manage (`PAYMENT_ENCRYPTION_KEY`) and a public callback URL that
  must be reachable by LiqPay (prod: `/api/liqpay/callback` via Nginx).
- The callback must verify the LiqPay signature, validate amount/currency, and
  be idempotent (a paid order is never reprocessed).
- IBAN and CASH remain unchanged; this ADR supersedes 0007 as the overall
  payment picture but does not remove those methods.
- Adding MonoPay later is an incremental change, not a new ADR.
