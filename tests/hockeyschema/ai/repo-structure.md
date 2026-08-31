---
title: Repo Structure
description: Explanation of this project's layout and where to place prompts, agents and tests.
owner: team-qa
tags: [docs, repo]
version: 1.0
---

# Project Structure

This project covers a single system under test — no multi-SUT nesting. Each
new system under test gets its own project (via `/new-project`) rather than
a subfolder inside this one.

```
features/            Gherkin feature files, tagged by type (@api, @ui, @e2e, @db)
steps/                step definitions, one *.steps.ts per feature file
steps/bdd.ts          local Given/When/Then export, see playwright-bdd-style.md
steps/fixtures.ts     Playwright-bdd test fixtures (config, world, Allure tagging)
steps/world.ts        shared per-scenario state
pageobjects/          page objects (UI tests only)
config/               environment-driven configuration (base URLs, etc.)
ai/                   this folder — guidelines and templates
```

Features and steps live flat in `features/` and `steps/`, not split into
per-type subfolders. The `@api`/`@ui`/`@e2e`/`@db` tag on each scenario is
what drives Allure reporting (see `steps/fixtures.ts`) and lets you run a
subset by type (`npx playwright test --grep @api`) — a folder split would
just duplicate that without adding anything, and tends to leave empty
folders for test types a given project doesn't have.

## Conventions
- Feature files describe business flows and carry a type tag.
- Step files glue Gherkin to Page Objects — one `*.steps.ts` per feature file.
- Page Objects only contain selectors + actions, no assertions.
- `config/project.config.ts` holds environment-driven configuration — no
  hardcoded environment values in steps or page objects.
- `steps/bdd.ts`, `steps/fixtures.ts`, `steps/world.ts` are shared wiring; see
  `playwright-bdd-style.md` for what each one is for.

## Branches & environments

Two long-lived branches, each tied to its own GitHub Environment (Settings >
Environments), so `BASE_URL`/`API_BASE_URL`/`USER_EMAIL`/`USER_PASSWORD` can
differ per environment without touching the workflow:

- `main` → **test** environment. Gets the latest changes first.
- `acceptance` → **acceptance** environment. Promoted from `main` once
  something has proven out on test — merge `main` into `acceptance` to
  promote (never the other way around).

Promote with a real merge commit, not a fast-forward:
`git checkout acceptance && git merge --no-ff main`. GitHub Pages tracks
its deployments by commit SHA — a fast-forward leaves `acceptance` on the
exact same SHA `main` already deployed, and Pages silently skips rebuilding
the site for a SHA it's already seen, so the Test Summary job's Allure
report update goes missing even though the job itself reports success.
`--no-ff` guarantees `acceptance` always gets its own SHA.

`.github/workflows/ci.yml` picks the right environment automatically from
the branch being pushed to (or, for a PR, the branch it targets) — no
separate workflow file per environment.
