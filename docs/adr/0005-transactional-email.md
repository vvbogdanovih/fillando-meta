# 0005 — Transactional email (Resend)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Fillando must send transactional email — chiefly order confirmations that
include the bank payment details (IBAN), since payment is by bank transfer
(see [ADR 0007](0007-payment-flow.md)).

## Decision

We will send transactional email through **Resend**, from a configured service
sender address. The order-confirmation email carries the payment requisites the
customer needs to complete the transfer.

## Consequences

- Simple API-based sending; the API key is environment config.
- Deliverability depends on correct domain/DNS (SPF/DKIM) setup.
- Email content is a functional part of the payment flow, not just a notification.
