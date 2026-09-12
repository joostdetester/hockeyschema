/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * Playwright-BDD runtime uses steps/api-health-check.steps.ts - these stubs
 * are never executed.
 */
import { When, Then } from '@cucumber/cucumber'

When('the user calls GET on the teams collection', function () {})
Then('the response status is {int}', function (p1) {})
Then('the response is valid JSON', function () {})
