# 0007 — Payment flow (IBAN bank transfer)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Fillando needs to collect payment for orders. A full online acquiring
integration adds cost, compliance, and integration overhead that the current
scope does not require.

## Decision

Payment is by **bank transfer**. On checkout the order is created, and the
customer receives a confirmation email (via [Resend](0005-transactional-email.md))
containing the **IBAN / payment requisites** managed in the admin panel
("Реквізити оплати"). No online card acquiring is in scope.

## Consequences

- Simple, low-cost, no PCI scope; the customer completes payment out of band.
- Payment confirmation/reconciliation is manual (admin-side) rather than
  automatic — order status reflects this.
- Adding online acquiring later would be a new ADR superseding this one.
