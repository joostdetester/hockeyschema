@api @smoke
Feature: API health check

  # There is no separate backend for this app - it talks to Firebase's
  # Firestore REST API directly. The `teams` collection is publicly
  # readable by design (see firestore.rules), so it's a stable, credential-
  # free endpoint to health-check against the real production API.
  Scenario: The public teams collection is reachable
    When the user calls GET on the teams collection
    Then the response status is 200
    And the response is valid JSON
