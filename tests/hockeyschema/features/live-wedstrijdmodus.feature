@ui @live-wedstrijdmodus
Feature: Live / Wedstrijdmodus

  # Wedstrijdmodus is the coach's compact in-match view (score, clock, goal
  # log, team notes); Live is the read-only page anyone gets once the coach
  # checks "Start wedstrijd". Both work off the same underlying match state,
  # so they're covered together here. Deliberately left undefined for now,
  # per the project's draft-first convention (see wedstrijdschema.feature) -
  # steps/page objects come after these are reviewed.

  Background:
    Given the user is logged in as a team member
    And the user opens the "Wedstrijdschema" tab
    And the user switches to Wedstrijdmodus

  @critical
  Scenario: Starting the match makes the Live page visible to everyone
    Given "Start wedstrijd" is unchecked
    When the user checks "Start wedstrijd"
    Then the "Live" tab becomes visible to a logged-out visitor
    When the user unchecks "Start wedstrijd"
    Then the "Live" tab is no longer visible to a logged-out visitor

  @critical
  Scenario: Logging a goal updates both the live score and the scorer's season tally
    Given the live score is 0-0
    And a player has 0 goals recorded for the season
    When the user logs a goal for that player
    Then the live score for the team's own side increases by one
    And that player's season goal tally increases by one

  @critical
  Scenario: Removing the most recent goal reverts both the score and the scorer's tally
    Given a goal has just been logged for a player
    When the user removes that goal via the "−" control
    Then the live score for the team's own side decreases by one
    And that player's season goal tally decreases by one again

  @critical
  Scenario: Resetting the live score also reverts every scorer's season tally
    # Regression test for the bug where "Reset" cleared the score/goal log
    # but left every scorer's season tally as it was.
    Given two different players have each scored a goal in the current match
    When the user resets the live score
    Then the live score for both teams is 0-0
    And the goal log for the current match is empty
    And both players' season goal tallies are back to what they were before either goal

  @critical
  Scenario: A goal is only recorded once the scorer is confirmed
    Given the "Wie scoorde?" dialog is open
    When the user selects a player without confirming
    Then the live score has not changed yet
    When the user confirms with "OK"
    Then the live score for the team's own side increases by one

  @high
  Scenario: The match clock can be started, paused and reset
    Given the match clock is at its starting value and not running
    When the user starts the clock
    Then the clock counts down
    When the user pauses the clock
    Then the clock stops counting down
    When the user resets the clock
    Then the clock returns to its starting value

  @medium
  Scenario: The manual clock field tracks the running clock until edited
    Given the match clock is running
    Then the manual-set field shows the same time as the running clock
    When the user types a value into the manual-set field
    Then the manual-set field keeps showing what the user typed, not the running clock

  @medium
  Scenario: A team-wide note can be logged from Wedstrijdmodus
    When the user adds a team note for the current quarter
    Then the note appears in the match's notes overview

  @high
  Scenario: Ending the match asks for confirmation before locking it
    Given the match has been started
    When the user chooses "Wedstrijd beëindigen"
    Then a confirmation asking to confirm the final score is shown
    When the user confirms
    Then the match is recorded as finished with that final score
