@accessibility @a11y @ui
Feature: Accessibility

  # This app has no separate routes - "Programma" is the tab shown on load,
  # so the existing homepage scan already covers it. Wedstrijdschema,
  # Strafcorner, Historie, Afspraken, Ouders and Teams aren't even in the menu
  # for an anonymous (logged-out) visitor - see App.jsx's LOGGED_IN_ONLY_TABS -
  # so they're not scanned here. Team is the only tab that stays in the menu
  # and gates its content behind team membership instead, rendering an
  # access-gate card rather than nothing, which is itself worth scanning.
  # Scans stay logged-out throughout, per ai/accessibility-testing.md's
  # caution against a11y scans touching authenticated/stateful flows on a
  # shared account.

  Scenario Outline: Homepage meets WCAG level <level>
    Given the user opens the homepage
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Team tab (logged out) meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Team" tab
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Login dialog meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the login dialog
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |
