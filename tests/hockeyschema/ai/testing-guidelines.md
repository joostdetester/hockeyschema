---
title: Testing Guidelines
description: Testing guidelines and best practices for writing reliable tests and handling test data/secrets.
owner: team-qa
tags: [testing, guidelines]
version: 1.0
---

# Testing Guidelines

## General Principles
- Prefer business-level test scenarios over UI implementation details
- Tests must be deterministic and stable
- Avoid flaky tests
- Keep tests readable and maintainable

## Do
- Use data-test-id or role selectors
- Reuse steps where possible
- Validate business outcomes

See `playwright-bdd-style.md` for Page Object Model and step-definition
conventions (thin steps, no locators/assertions inside them).

## Do Not
- Do NOT use hard waits (`page.waitForTimeout`) — enforced by
  `eslint-plugin-playwright`'s `no-wait-for-timeout` rule (`npm run lint`)
- Do NOT assert on implementation details (CSS, internal IDs)
- Do NOT hardcode test data inside steps
- Do NOT duplicate step logic
- Do NOT perform heavy logic in step definitions

## Linting, Formatting & Typechecking
- `npm run lint` / `npm run lint:fix` — ESLint with `eslint-plugin-playwright`,
  catches some of the rules above automatically (see `eslint.config.mjs`).
  Not every guideline here can be linted — the rest still relies on review.
- `npm run typecheck` — `tsc --noEmit`, catches type errors without emitting
  build output.
- `npm run format` — Prettier, for consistent formatting.
- CI runs `lint` and `typecheck` as their own jobs before the `playwright`/
  `accessibility` jobs start — see `repo-structure.md` and the root
  `README.md`'s CI section.

## Test Data
- Use factories or fixtures
- Keep test data configurable per environment
- Do not rely on shared state between tests

## Failure Handling
- Fail fast on critical flows
- Provide clear assertions and error messages

## Secrets
- Never commit real credentials or API keys — use `.env` (gitignored) with
  `.env.example` documenting the required keys.
- CI secrets belong in the pipeline's secret store, not in this repo.
