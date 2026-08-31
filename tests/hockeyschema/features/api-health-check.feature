@api @smoke
Feature: API health check

  Scenario: API root responds successfully
    When the user calls GET on the API root
    Then the response status is 200
