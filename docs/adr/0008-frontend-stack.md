# 0008 — Frontend stack (Next.js 16 / React 19)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

The storefront and admin panel need SSR/SEO for the catalog, a modern component
model, typed forms, and clean separation of server and client state, in
Ukrainian with UAH pricing.

## Decision

We will build the frontend on **Next.js 16 (App Router)** with **React 19** and
**TypeScript**. State is split between **Zustand** (auth store, cart store) and
**React Query** (server data). Forms use **React Hook Form + Zod**. HTTP goes
through a single **Axios** instance with automatic token refresh. Styling is
**Tailwind CSS 4** (dark mode only) with custom components following shadcn/ui
conventions over Radix primitives. The cart is dual-mode (guest `localStorage` +
server API).

## Consequences

- SSR/SEO for catalog and product pages; App Router conventions throughout.
- Clear split: Zustand for client state, React Query for server cache.
- Dark-mode-only simplifies theming but rules out a light theme without rework.
