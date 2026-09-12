/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * Playwright-BDD runtime uses steps/homepage.steps.ts - these stubs are
 * never executed.
 */
import { Given, Then, When } from '@cucumber/cucumber'

Given('the user opens the homepage', function () {})
When('the user opens the login dialog', function () {})
Then('the page title contains {string}', function (p1) {})
Then('a decorative HCRB watermark is visible behind the page content', function () {})
