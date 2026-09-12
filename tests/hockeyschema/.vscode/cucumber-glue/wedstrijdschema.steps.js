/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * wedstrijdschema.feature's steps have no real implementation yet (draft,
 * per todo.md) - these stubs only silence editor squiggles. Background
 * steps and "checks/unchecks {string}" come from common.steps.js.
 */
import { Given, Then } from '@cucumber/cucumber'

Given('a schedule has been generated for the selected match', function () {})
Then('{string}, {string} and {string} are shown on the same row', function (p1, p2, p3) {})
Then('{string} is shown alone on the row below it', function (p1) {})
Given('no keeper switch is configured', function () {})
Then('the {string} checkbox is not shown', function (p1) {})
Then('the {string} checkbox is shown', function (p1) {})
Given('{string} is checked', function (p1) {})
Given('a strafcorner role has more than one assigned player selected for the match', function () {})
Then('the strafcorner summary shows all of their names for that role, not just the first', function () {})
Given('the match schedule is locked', function () {})
Then('the {string} banner is excluded from printing', function (p1) {})
Then('every position block is set to get a border when printing', function () {})
Then('no {string} section is shown', function (p1) {})
Then('the print dialog no longer offers a {string} option', function (p1) {})
