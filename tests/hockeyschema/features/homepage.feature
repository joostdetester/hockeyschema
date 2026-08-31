@ui @smoke
Feature: Homepage

  Scenario: Homepage shows the expected title
    Given the user opens the homepage
    Then the page title contains "Wedstrijdschema"
