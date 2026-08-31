---
title: Accessibility Testing
description: Three-level (A/AA/AAA), severity-gated accessibility testing approach for this project's Playwright BDD UI suite.
owner: team-qa
tags: [testing, accessibility, ui, axe]
version: 4.0
---

# Accessibility Testing

## Scope
- Accessibility tests in this project run only on UI flows.
- Start with stable entry pages to keep failures actionable and reduce noise.
- Every page/flow under test is scanned against all three WCAG conformance
  levels — A, AA, AAA — not just a single combined baseline.

## Severity scale
`@axe-core/playwright` reports each violation's impact as one of four
levels. This project maps them 1:1 onto a business-facing severity scale:

| Axe impact | Severity        | Meaning                                      |
| ---------- | ---------------- | --------------------------------------------- |
| `critical` | Blocker/Critical | User cannot complete the task                  |
| `serious`  | Major            | Task is possible, but with real difficulty     |
| `moderate` | Minor            | Irritating or confusing, not blocking          |
| `minor`    | Cosmetic         | Small visual/textual polish item               |

A violation with no scored impact (rare, but axe's types allow it) is
treated as `critical` — an un-scored finding must never silently slip
through a gate meant to catch the worst issues.

## WCAG levels and gates
Each level scans a cumulative, larger axe tag set (AA requires meeting A;
AAA requires meeting AA and A) — see `pageobjects/_shared/accessibility.ts`
for the exact tag lists. Each level has its own pass/fail gate:

| Level | Axe tags (cumulative)                                   | Gate                          |
| ----- | --------------------------------------------------------- | ------------------------------ |
| A     | `wcag2a`, `wcag21a`                                        | 0 Blocker/Critical, 0 Major    |
| AA    | + `wcag2aa`, `wcag21aa`                                    | 0 Blocker/Critical             |
| AAA   | + `wcag2aaa`, `wcag21aaa`                                  | 0 Blocker/Critical             |

A is the strict baseline (both Blocker/Critical and Major fail it). AA and
AAA only gate on Blocker/Critical — their much larger rule sets surface far
more Major/Minor/Cosmetic findings than A does, and those are tracked (full
results are always attached, see Reporting below) rather than
release-blocking at those levels. Tighten AA/AAA's gate to also fail on
Major once the team has burned down the current findings baseline at those
levels — don't tighten it up front on an untested page, or the first real
scan will fail on a backlog of pre-existing findings instead of on
regressions.

## Reusable pattern
This is a generic pattern, not something wired to the homepage specifically:

- `scanAccessibility(page, testInfo, level)` in
  `pageobjects/_shared/accessibility.ts` runs the scan for one WCAG level
  and returns `{ violations, failingViolations }` — `failingViolations` is
  already filtered to the level's gate.
- `Then the page meets WCAG level {word}` in `steps/accessibility.steps.ts`
  calls it and asserts zero failing violations for whatever page/state the
  scenario is currently on.
- To add accessibility coverage for a new page: navigate to it with the
  page's existing steps/page object, then add
  `Then the page meets WCAG level <level>` — same as any other page, no new
  plumbing needed. See `features/accessibility.feature` for the Scenario
  Outline pattern (one scenario templated across the three levels via an
  `Examples` table) — reuse that shape rather than writing three near-
  identical scenarios by hand.

## Reporting
Every scan attaches three files per level to the test report, so findings
are reviewable even when the scenario passes (e.g. AA/AAA's non-blocking
Major/Minor/Cosmetic findings):

- `axe-results-<level>.json` — the full raw axe-core result.
- `axe-summary-<level>.txt` — a technical, human-readable report: for each
  violated rule, its axe rule id, impact, description, help text and
  `helpUrl` (a direct link to that rule's Deque University page), plus
  every affected element's selector and axe's own `failureSummary` (which
  already spells out the concrete fix, e.g. the exact contrast ratio
  measured vs. required).
- `axe-violations-<level>.png` — a full-page screenshot with a red box
  drawn around every violating element found at that level (not just the
  ones failing the level's gate), so a reviewer can see exactly where each
  finding is without cross-referencing selectors by hand. Only attached
  when there's at least one violation. Implemented with absolutely-
  positioned overlay elements rather than styling the violating elements
  directly — sites often reset `outline` (etc.) with their own
  `!important` rules (frequently the very anti-pattern axe is flagging),
  which silently wins over an inline style regardless of `!important`. A
  freshly appended overlay has no competing rules to lose to.

## Standalone HTML report
Besides the per-scenario Allure attachments above, `scanAccessibility` also
writes one JSON record per scan (page name, level, URL, technical violation
detail, screenshot filename) to `a11y-report-data/`. Run
`npm run a11y:report` (after `npm run test:a11y`) to aggregate every record
across all pages and all three WCAG levels into one standalone,
dependency-free HTML file at `a11y-report/index.html` — open it directly in
a browser, no Allure needed. Its layout: an overall summary card, then one
section per WCAG level, each with its own per-page cards showing the
red-boxed screenshot (see Reporting above) and every violation's technical
detail.

`scripts/build-a11y-report.mjs` does the aggregation — plain Node, no
template engine or extra dependency, so it's easy to adjust the layout
directly in that file. CI builds this report in the `accessibility` job
(`npm run a11y:report`, uploaded as the `a11y-report` artifact) and the
`test-summary` job publishes it to GitHub Pages under this branch's own
`a11y-report/` subpath, alongside the Allure report.

## Tags
- Use `@accessibility` and `@a11y` on dedicated accessibility scenarios.
- Combine them with the existing `@ui` tag.
- `@accessibility` also drives CI job selection: `npm run test:a11y` runs
  only `@accessibility`-tagged scenarios (CI's `accessibility` job),
  `npm run test:e2e` runs everything else (CI's `playwright` job) — see
  the root `README.md`'s CI section. Any new accessibility scenario needs
  the `@accessibility` tag to actually land in the right job.

## Guidelines
- Reuse existing navigation steps and page objects — don't duplicate
  navigation logic inside an accessibility scenario.
- Keep accessibility checks in dedicated scenarios instead of mixing them
  into broad E2E flows.
- Attach full scan output so findings can be reviewed even when the test
  passes (see Reporting above).
- List the additional entry pages for this project's first accessibility
  pass here (e.g. the login page, the main landing page, the primary
  conversion flow) once known.
