/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * Playwright-BDD runtime uses steps/accessibility.steps.ts - these stubs are
 * never executed. "opens the homepage" / "opens the {string} tab" / "opens
 * the login dialog" are covered by homepage.steps.js.
 */
import { Then } from '@cucumber/cucumber'

Then('the page meets WCAG level {word}', function (p1) {})
