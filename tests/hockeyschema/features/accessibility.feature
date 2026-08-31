@accessibility @a11y @ui
Feature: Homepage accessibility

  Scenario Outline: Homepage meets WCAG level <level>
    Given the user opens the homepage
    Then the page meets WCAG level <level>

    Examples:
      | level |
      | A     |
      | AA    |
      | AAA   |
