# hockeyschema

Playwright + Cucumber (BDD) test-automation project for a single system under
test, scaffolded via `/new-project`. See `ai/` for the guidelines this
project should follow (style, testing practices, accessibility approach).

## Setup

```
npm install
npx playwright install
copy .env.example .env
```

Fill in `BASE_URL` and `API_BASE_URL` in `.env` for the system under test.

## Run tests

```
npm run bdd            # generate specs from features + run everything, with Allure reporting
npm run bdd:headed     # same, with a visible browser
npm run test:e2e       # everything except @accessibility — what CI's Playwright job runs
npm run test:a11y      # only @accessibility — what CI's Accessibility job runs
```

## View the Allure report

```
npm run allure:generate
npm run allure:open
```

## Linting, formatting, cleanup

```
npm run lint            # ESLint (eslint-plugin-playwright), catches some ai/testing-guidelines.md rules
npm run lint:fix
npm run typecheck        # tsc --noEmit
npm run format           # Prettier
npm run clean             # remove test-results/, allure-results/, allure-report/, playwright-report/, .features-gen/
```

A VS Code debug config for stepping through tests is in `.vscode/launch.json`.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main` or
`acceptance`, as four jobs:

- `lint` and `typecheck` — cheap static checks, run in parallel.
- `playwright` — `npm run test:e2e` (everything except `@accessibility`).
  Only starts once `lint`/`typecheck` are green.
- `accessibility` — `npm run test:a11y` (only `@accessibility`). Also gated
  on `lint`/`typecheck`.

It only becomes active once this project has its own GitHub remote (e.g.
after `/extract-project`) — nothing to do locally. See
`ai/repo-structure.md` for the `main`/`acceptance` branch and GitHub
Environment model; set the real `BASE_URL`/`API_BASE_URL` per environment
(Settings > Environments > test / acceptance) rather than relying on the
demo defaults in `config/project.config.ts`.

## Structure

- `features/` — Gherkin feature files, tagged by type (`@api`, `@ui`, `@e2e`, `@db`).
- `steps/` — step definitions, one `*.steps.ts` per feature file, calling page objects.
- `pageobjects/` — one file per screen/component; selectors and actions only,
  no assertions. `pageobjects/_shared/` holds cross-page helpers (e.g. the
  accessibility scan used by `features/accessibility.feature`).
- `config/project.config.ts` — environment-driven configuration (base URLs).
- `steps/bdd.ts`, `steps/fixtures.ts`, `steps/world.ts` — Cucumber/Playwright
  wiring; see `ai/playwright-bdd-style.md` for the conventions behind them.
- `ai/` — guidelines this project follows (style, testing practices,
  accessibility, project context).
- `.github/workflows/ci.yml` — CI pipeline, see above.
