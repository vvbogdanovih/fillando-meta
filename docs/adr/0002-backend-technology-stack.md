# 0002 — Backend technology stack (NestJS + MongoDB)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Fillando needs a backend for a product catalog, cart, orders, and admin
management, with a well-structured module system, strong TypeScript support, and
first-class validation and OpenAPI generation.

## Decision

We will build the backend on **NestJS** (TypeScript) with **MongoDB** accessed
through **Mongoose**, using a **repository pattern** over the models. The API is
documented with Swagger at `/swagger`. There is **no global route prefix** — the
`/api` prefix is added only by Nginx in production (see
[environments](../environments.md)).

## Consequences

- Modular, DI-based structure with strong typing and decorator-based validation.
- Document model fits the catalog/order domain and evolves without migrations,
  at the cost of enforcing invariants in application code.
- Clients generate types from the backend OpenAPI; keep it current.
