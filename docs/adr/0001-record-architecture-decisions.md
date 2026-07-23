# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

As Fillando grows across two repositories (`fillando-be`, `fillando-fe`),
significant technical choices — database, auth, storage, payments, delivery —
need a durable, discoverable record of *what* was decided and *why*, so newcomers
and future changes do not re-litigate settled questions or accidentally violate a
constraint.

## Decision

We will keep **Architecture Decision Records** in `docs/adr/`, one Markdown file
per decision, numbered sequentially (`NNNN-short-slug.md`), following the format
in [`docs/templates/adr.md`](../templates/adr.md). ADRs are immutable once
accepted; a superseding decision gets a new ADR and marks the old one
`Superseded`.

## Consequences

- Decisions are discoverable in one place and linkable from TDs, plans, and the FRD.
- A small amount of ceremony is added to significant decisions (routine ones are
  exempt).
- The existing implemented decisions are back-filled as ADRs 0002–0008.
