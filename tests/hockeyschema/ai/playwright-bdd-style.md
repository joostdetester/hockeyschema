---
title: Playwright BDD Style
description: Style guide for writing Playwright BDD feature files and step implementations.
owner: team-qa
tags: [style, playwright, bdd]
version: 1.0
---

# Playwright + BDD Style Guide

## Feature Files (Gherkin)
- Use Given / When / Then
- Describe behavior, not UI mechanics
- Avoid technical language in scenarios
- Scenarios must be independently runnable
- Scenarios must contain meaningful tags
- All Given/When/Then steps MUST be written in English.
- Steps should be specific and explicit (use concrete placeholders or values), not vague/generic actions.

### Scenario Outlines (Examples)
- By default, each example row is shown as a generic `Example #n` in Playwright/Allure.
- To make report entries include the variable value, customize the generated example title:
	- Put `<column>` placeholders in the `Scenario Outline` title (e.g. `... for author "<author>"`).
	- Or add `# title-format: ... <column> ...` right above `Examples:`.
	- (Optional) Set the global `examplesTitleFormat` in `defineBddConfig`.

### Good
```
Scenario: User completes checkout
	Given the user is logged in
	When the user completes checkout
	Then the order should be created successfully
```

### Bad
```
Scenario: Click submit button
	When I click the #submit button
	Then the API returns 200
```

## Principles for consistent Playwright-BDD integration

- Always import Given/When/Then from a local `bdd.ts` (never directly from `@cucumber/cucumber`)
- Each step receives a context object with `{ page, config, world }` (the Playwright-bdd test fixtures defined in `steps/fixtures.ts`)
- Page Objects have a constructor with `page: Page` and use Playwright's API directly
- Follow the repo conventions for file names and locations (feature file, steps, page objects) — see `repo-structure.md`
- Use only local dependencies, never global Cucumber installations

## Step Definitions
- Steps should call Page Object methods
- All words should be lowercase; variables within the step can contain uppercase words
- No locators inside step files
- No assertions in Page Objects (assert in steps or helper assertions)
- Keep step definitions small and readable

## Page Objects
- Encapsulate selectors and UI actions
- Expose meaningful business actions
- No assertions in Page Objects
- One page object per screen or component

## Naming
- Feature files: kebab-case.feature
- Step files: *.steps.ts
- Page objects: *.page.ts
