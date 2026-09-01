@ui @smoke
Feature: Homepage

  Scenario: Homepage shows the expected title
    Given the user opens the homepage
    Then the page title contains "Wedstrijdschema"

  Scenario: A faint HCRB watermark is shown behind the page content
    Given the user opens the homepage
    Then a decorative HCRB watermark is visible behind the page content
