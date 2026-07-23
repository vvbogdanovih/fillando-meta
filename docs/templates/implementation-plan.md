<!--
  Implementation Plan template.
  Copy into ../plans/ as NNNN-short-slug.md and fill it in. A plan usually
  follows an approved TD — link it below. Delete guidance comments as you go.
-->

# Plan-NNNN — <Title>

- **Status:** Draft  <!-- Draft | In Review | Approved | In Progress | Done -->
- **Owner:** <name>
- **Date:** YYYY-MM-DD
- **Target:** <milestone / release>
- **Design (TD):** <link to the TD this implements>
- **Components:** <fillando-be | fillando-fe | both>

## 1. Objective

What we are delivering and the definition of done — in one or two sentences.

## 2. Scope

**In scope**
- ...

**Out of scope**
- ...

## 3. Work breakdown

Concrete, reviewable tasks. Keep each small enough to land in a single PR.
Remember: **one PR = one repo**.

| # | Task | Component | Depends on | Status |
|---|------|-----------|------------|--------|
| 1 | ... | fillando-be | — | ☐ |
| 2 | ... | fillando-fe | 1 | ☐ |

## 4. Sequencing & milestones

Order of execution and what can run in parallel. Backend endpoints usually land
before the frontend that consumes them.

## 5. Dependencies & risks

- **Dependencies:** external services (Nova Post, S3, Resend), decisions still open.
- **Risks:** what could go wrong, likelihood/impact, and mitigation.

## 6. Testing & rollout

- How each part is tested before merge.
- Deployment order, migrations, rollback plan.

## 7. Open questions

- ...
