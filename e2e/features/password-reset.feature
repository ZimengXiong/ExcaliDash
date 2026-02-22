@auth
Feature: Password reset flow
  As a user who forgot their password
  I want to request a password reset
  So that I can regain access to my account

  Scenario: Password reset request page is accessible
    When I navigate to the password reset page
    Then I should see the password reset information

  Scenario: Forced password reset on first login
    Given a user exists with must-reset-password enabled
    When the user logs in with their temporary password
    Then the user should be prompted to set a new password
    When the user sets a new password
    Then the forced reset should complete successfully
