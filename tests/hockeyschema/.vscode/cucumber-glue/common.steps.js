/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * Playwright-BDD runtime uses steps/*.ts - these stubs are never executed.
 * Mirrors steps/common.steps.ts + the tab-switch/check/uncheck steps shared
 * across multiple feature files.
 */
import { Given, When } from '@cucumber/cucumber'

Given('the user is logged in as a team member', function () {})
When('the user switches to Wedstrijdmodus', function () {})
When('the user opens the {string} tab', function (p1) {})
When('the user checks {string}', function (p1) {})
When('the user unchecks {string}', function (p1) {})
