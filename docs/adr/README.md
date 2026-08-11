# Architecture Decision Records (ADR)

An ADR captures a single significant architectural decision, the context that
forced it, and its consequences. They are short, immutable once accepted, and
numbered sequentially.

## When to write one

Write an ADR when a decision is hard to reverse or affects more than one
component — choosing a database, an auth strategy, a storage backend, a payment
flow, a delivery integration. Routine choices do not need an ADR.

## How to add one

1. Copy [`../templates/adr.md`](../templates/adr.md) to `NNNN-short-slug.md`
   using the next free number.
2. Fill it in and set the status.
3. Add it to the index below.

Once accepted, an ADR is not rewritten — supersede it with a new one and mark
the old as `Superseded by NNNN`.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-backend-technology-stack.md) | Backend technology stack (NestJS + MongoDB) | Accepted |
| [0003](0003-authentication-strategy.md) | Authentication strategy (JWT cookies + Google OAuth) | Accepted |
| [0004](0004-file-storage.md) | File storage (AWS S3 presigned URLs) | Accepted |
| [0005](0005-transactional-email.md) | Transactional email (Resend) | Accepted |
| [0006](0006-delivery-integration.md) | Delivery integration (Nova Post) | Accepted |
| [0007](0007-payment-flow.md) | Payment flow (IBAN bank transfer) | Superseded by 0009 |
| [0008](0008-frontend-stack.md) | Frontend stack (Next.js 16 / React 19) | Accepted |
| [0009](0009-online-payment-liqpay.md) | Online payment via LiqPay | Accepted |
