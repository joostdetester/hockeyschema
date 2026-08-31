---
title: Video-to-Test Workflow
description: Step-by-step guide to turn a UI video into a working Playwright-BDD test.
owner: team-qa
tags: [docs, workflow, video, playwright, bdd, prompts]
version: 1.0
---

# Video -> Prompt -> Feature/Steps/POM -> Run

This document describes the generic workflow to create a new automated test
in this project from a UI screen recording (Playwright + playwright-bdd +
Page Object Model + Allure).

## Prerequisites

- Install dependencies:
  - `npm install`
  - `npx playwright install`
- You have a video of a **happy flow** (preferably short and without unnecessary detours).

## Step 1 - Add the video to the project

- Use a clear name, for example: `videos/<flow-name>.mp4`.

Naming rule (important):
- Use **kebab-case** for `<flow-name>` (lowercase words separated by `-`).
- Do **not** use spaces in filenames.

Why: on Windows/PowerShell and when using nested `npm run ...` scripts, filenames with spaces can be split into multiple CLI arguments and cause errors like "No tests found".

Tip: if you have multiple variants (desktop/mobile), include that in the file name.

## Step 2 - Ask an agent to generate the feature, steps, and page objects

Use a prompt along these lines (keep it generic):

- I recorded a video of a UI flow at `videos/<flow-name>.mp4`.
- Follow `ai/playwright-bdd-style.md` and `ai/repo-structure.md` for
  conventions.
- Generate:
  - A feature file: `features/<flow-name>.feature`
  - Step definitions: `steps/<flow-name>.steps.ts`
  - Page objects: `pageobjects/**` (one per screen, reuse existing ones where possible)

Important:
- Keep step files "thin": mostly call Page Object methods.
- Locator/selector logic belongs in Page Objects.
- Assertions belong in steps (or dedicated assert helpers), not in Page Objects.
- Don't guess selectors from the video — verify them against the running app.
- No secrets in the generated files.

## Step 3 - Generate the Playwright specs (bddgen)

Playwright-BDD turns `.feature` files into runnable Playwright tests in `.features-gen/`.

Run:

```
npm run bddgen
```

Helpful to verify whether your scenarios are discovered correctly:

```
npx playwright test --list
```

## Step 4 - Run the test to verify

### Option A: run everything (including Allure)

```
npm run bdd
```

### Option B: run one feature file

```
# Playwright runs the generated spec file, not the .feature file.
npx playwright test .features-gen/features/<flow-name>.feature.spec.js
```

### Option C: debug headed

```
npm run bdd:headed
```

Tip: use `--grep` to filter by scenario title or tag (e.g. `--grep @ui`).

## Step 5 - View Allure

After a run, results are stored in `allure-results/`.

Generate + open the report:

```
npm run allure:generate
npm run allure:open
```

## Troubleshooting (short)

- If you see "Example #n" in Allure for a `Scenario Outline`:
  - Add `<column>` placeholders to the `Scenario Outline` title (e.g. `"<author>"`), or
  - Use `# title-format:` above `Examples:`.
- If a UI step is flaky:
  - Stabilize it in the Page Object (better waits/locators) and keep the Gherkin business-oriented.
