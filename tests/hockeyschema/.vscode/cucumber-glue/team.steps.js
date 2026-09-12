/*
 * IDE-only step map for Gherkin diagnostics (cucumber-official extension).
 * team.feature's steps have no real implementation yet (draft, per todo.md) -
 * these stubs only silence editor squiggles; Background steps ("logged in
 * as a team member" / "opens the {string} tab") come from common.steps.js.
 */
import { Given, Then, When } from '@cucumber/cucumber'

Then('every position column header shows how many players have a preference set for it', function () {})
Then("every player's name shows how many positions she has a preference set for", function () {})
Given('a player has no preference set for a given position', function () {})
When('the user sets a preference for that player on that position', function () {})
Then("that position's column count increases by one", function () {})
Then("that player's own count increases by one", function () {})
Given('a player has a preference set for a given position', function () {})
When('the user clears that preference', function () {})
Then("that position's column count decreases by one", function () {})
Then("that player's own count decreases by one", function () {})
Given('a player is marked as {string}', function (p1) {})
Then('her name is shown with a {string} suffix wherever only her first name is displayed', function (p1) {})
