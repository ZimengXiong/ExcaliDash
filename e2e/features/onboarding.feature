@onboarding
Feature: First-run onboarding
  As a new operator
  I want to set up authentication on first run
  So that my instance is configured correctly

  # These scenarios require a fresh database with no existing users.
  # They should be run in isolation, not as part of the standard test suite.
  # Use tag @onboarding to filter.

  Scenario: Auth status reports onboarding required on fresh instance
    When I check the auth status on a fresh instance
    Then the auth status should indicate onboarding is required

  Scenario: Onboarding choice page is displayed on first visit
    When I visit the application on a fresh instance
    Then I should see the auth setup choice page

  Scenario: Operator can enable authentication during onboarding
    When I choose to enable authentication during onboarding
    Then a bootstrap setup code should be generated
    And I should be able to register the first admin account
