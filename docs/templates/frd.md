<!--
  Functional Requirements Document (FRD) template.
  Copy into ../requirements/ and fill it in. Describe behaviour and outcomes —
  NOT technical solutions. The "how" is the TD's job. Delete guidance comments
  as you go.
-->

# FRD — <Title>

- **Status:** Draft  <!-- Draft | In Review | Approved | Superseded -->
- **Author:** <name>
- **Date:** YYYY-MM-DD
- **Related:** <links to TDs, ADRs, tickets>

## 1. Overview

What feature/area this covers and the business need behind it, in one short
paragraph.

## 2. Objectives & success criteria

- What outcome the business wants.
- How we will know it succeeded (measurable where possible).

## 3. Scope

**In scope**
- ...

**Out of scope**
- ...

## 4. Actors & roles

Who interacts with this functionality (Guest, USER, ADMIN, System) and what
they are allowed to do.

## 5. Functional requirements

Number every requirement so it can be referenced from TDs, tasks, and tests.

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | The system shall ... | Must |
| FR-2 | The system shall ... | Should |

<!-- Priority: Must / Should / Could / Won't (MoSCoW) -->

## 6. User stories / use cases

> **As a** \<role\>, **I want** \<capability\>, **so that** \<benefit\>.
>
> **Acceptance criteria**
> - Given ... when ... then ...

## 7. Business rules

Constraints and logic that must always hold (validation, limits, permissions,
pricing/discount calculations).

## 8. Non-functional expectations

Performance, availability, security, localization (Ukrainian / UAH),
accessibility. Detailed targets are refined in the TD.

## 9. Assumptions & dependencies

- Assumptions made while writing this.
- External dependencies (Nova Post, S3, Resend, Google OAuth).

## 10. Open questions

- ...
