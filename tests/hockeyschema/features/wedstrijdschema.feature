@ui @wedstrijdschema @critical
Feature: Wedstrijdschema

  # Same "logged in as a team member" dependency as team.feature - most of these also
  # need a generated schedule (Stap 3), which itself needs a selection + keeper first.
  # Deliberately left undefined for now, per request - steps/page objects come after
  # these are reviewed.

  Background:
    Given the user is logged in as a team member
    And the user opens the "Wedstrijdschema" tab

  Scenario: Links achter and Rechts achter sit next to Voorstopper in the formation grid
    Given a schedule has been generated for the selected match
    Then "Links achter", "Voorstopper" and "Rechts achter" are shown on the same row
    And "Laatste man" is shown alone on the row below it

  Scenario: The keeper play-out option only appears once the keeper switches
    Given no keeper switch is configured
    Then the "Keepers spelen in de helft dat ze niet keepen mee in het veld" checkbox is not shown
    When the user checks "Keeper wisselt na 2 kwarten (na de rust)"
    Then the "Keepers spelen in de helft dat ze niet keepen mee in het veld" checkbox is shown

  Scenario: Unchecking the keeper switch hides the play-out option again
    Given "Keeper wisselt na 2 kwarten (na de rust)" is checked
    And "Keepers spelen in de helft dat ze niet keepen mee in het veld" is checked
    When the user unchecks "Keeper wisselt na 2 kwarten (na de rust)"
    Then the "Keepers spelen in de helft dat ze niet keepen mee in het veld" checkbox is not shown

  Scenario: The strafcorner summary lists every assigned player who is present, not just one
    Given a strafcorner role has more than one assigned player selected for the match
    Then the strafcorner summary shows all of their names for that role, not just the first

  Scenario: The read-only banner is excluded from the printed match sheet
    Given the match schedule is locked
    Then the "Dit schema is opgeslagen en staat op alleen-lezen" banner is excluded from printing

  Scenario: Every position block gets a border when printing
    Given a schedule has been generated for the selected match
    Then every position block is set to get a border when printing

  Scenario: The Wisselmomenten block no longer exists
    Given a schedule has been generated for the selected match
    Then no "Wisselmomenten" section is shown
    And the print dialog no longer offers a "Wisselmomenten" option
