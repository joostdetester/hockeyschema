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

Three long-lived branches, each tied to its own GitHub Environment (Settings
> Environments), so `BASE_URL`/`API_BASE_URL`/`USER_EMAIL`/`USER_PASSWORD`
can differ per environment without touching the workflow:

- `test` → **test** environment. Freely pushable — no PR required. Gets the
  latest changes first.
- `acceptance` → **acceptance** environment. Promoted from `test` via PR once
  something has proven out on test.
- `main` → **production** environment. Promoted from `acceptance` via PR
  once something has proven out on acceptance.

`acceptance` and `main` both require a pull request — direct pushes are
blocked by branch protection (Settings > Branches). `test` has no such
restriction. Promotion always flows one direction: test → acceptance → main,
never backwards.

`.github/workflows/ci.yml` picks the right environment (and, for deploys,
the right Firebase project alias — see `apps/hockeyschema/.firebaserc`)
automatically from the branch being pushed to (or, for a PR, the branch it
targets) — no separate workflow file per environment. On every push (i.e.
after a PR merges, or a direct push to `test`) the `deploy` job builds
`apps/hockeyschema` for that environment and deploys it to that
environment's Firebase Hosting project, using the `FIREBASE_TOKEN` repo
secret (from `firebase login:ci`); a `pull_request` run skips the deploy
step and tests against whatever is currently live in the target environment
as a pre-merge sanity check.
