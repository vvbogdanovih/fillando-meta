# 0003 — Authentication strategy (JWT cookies + Google OAuth)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Users authenticate with email/password and via Google. Sessions must be secure
against XSS token theft and support silent renewal, with two roles (`USER`,
`ADMIN`).

## Decision

We will issue **JWT access tokens in httpOnly cookies** plus a long-lived
**refresh token** (stored server-side and in an httpOnly cookie) for silent
renewal; the frontend Axios client refreshes automatically. **Google OAuth** is
supported alongside email/password. Passwords are hashed with **Argon2** plus a
server-side **pepper**. Authorization is role-based (`USER`, `ADMIN`).

## Consequences

- httpOnly cookies keep tokens out of JS, reducing XSS token-theft risk; CSRF
  protections and correct cookie flags per environment are required.
- Refresh tokens must be revocable/rotatable on logout and compromise.
- The pepper is an environment secret and must never be committed.
