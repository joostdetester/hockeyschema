@ui @team
Feature: Team roster

  # "logged in as a team member" is new step vocabulary this project doesn't have yet -
  # every scenario below needs it, since the Team tab's roster table is gated to team
  # members (see App.jsx's accessGate). Deliberately left undefined for now, per request -
  # steps/page objects come after these are reviewed.

  Background:
    Given the user is logged in as a team member
    And the user opens the "Team" tab

  Scenario: Each position column header shows how many players can play it
    Then every position column header shows how many players have a preference set for it

  Scenario: Each player's name shows how many positions she can play
    Then every player's name shows how many positions she has a preference set for

  Scenario: Adding a position preference updates both counts immediately
    Given a player has no preference set for a given position
    When the user sets a preference for that player on that position
    Then that position's column count increases by one
    And that player's own count increases by one

  Scenario: Removing a position preference updates both counts immediately
    Given a player has a preference set for a given position
    When the user clears that preference
    Then that position's column count decreases by one
    And that player's own count decreases by one

  Scenario: An invaller's name is marked with (I)
    Given a player is marked as "Invaller"
    Then her name is shown with a "(I)" suffix wherever only her first name is displayed
