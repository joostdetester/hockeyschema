@accessibility @a11y @ui
Feature: Accessibility

  # This app has no separate routes - "Programma" is the tab shown on load,
  # so the existing homepage scan already covers it. Every other tab below
  # is reachable by an anonymous (logged-out) visitor - see App.jsx: only
  # Team/Historie/Afspraken gate their content behind team membership, and
  # even then they render an access-gate card rather than nothing, which is
  # itself worth scanning. Scans stay logged-out throughout, per
  # ai/accessibility-testing.md's caution against a11y scans touching
  # authenticated/stateful flows on a shared account.

  Scenario Outline: Homepage meets WCAG level <level>
    Given the user opens the homepage
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Wedstrijdschema tab meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Wedstrijdschema" tab
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Strafcorner tab meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Strafcorner" tab
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Teams tab meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Teams" tab
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

  Scenario Outline: Historie tab (logged out) meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Historie" tab
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |

  Scenario Outline: Afspraken tab (logged out) meets WCAG level <level>
    Given the user opens the homepage
    When the user opens the "Afspraken" tab
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
