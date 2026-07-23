# 0006 — Delivery integration (Nova Post)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Fillando ships physical goods within Ukraine. Customers expect delivery to a
Nova Post (Нова Пошта) city and warehouse/parcel-locker, chosen at checkout.

## Decision

We will integrate the **Nova Post API**. Cities and warehouses are synced and
exposed through backend search endpoints; the checkout form lets the customer
search a city and select a warehouse as the delivery point.

## Consequences

- Checkout depends on Nova Post data being synced and searchable; sync jobs and
  the API key are operational concerns.
- The order model stores the selected city/warehouse references.
- If other carriers are added later, delivery selection must be generalised.
