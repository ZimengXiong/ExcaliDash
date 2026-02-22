@oidc
Feature: OIDC Authentication
  As a user of an ExcaliDash instance configured with OIDC
  I want to sign in using my OIDC identity provider
  So that I can access my drawings with single sign-on

  Background:
    Given the server is running with OIDC enabled

  Scenario: Auth status reports OIDC enabled
    When I request the auth status
    Then the auth status should indicate OIDC is enabled
    And the auth status should include an OIDC provider name

  Scenario: OIDC start endpoint redirects to identity provider
    When I request the OIDC start endpoint
    Then I should be redirected to the OIDC authorization URL
    And the redirect URL should include a code challenge

  Scenario: OIDC button is visible on login page in hybrid mode
    Given auth mode is "hybrid"
    When I navigate to the login page
    Then I should see a "Continue with" OIDC button
    And I should also see the local email and password fields

  Scenario: OIDC enforced mode auto-redirects from login page
    Given auth mode is "oidc_enforced"
    When I navigate to the login page
    Then I should see the OIDC provider name in the heading
    And I should see a "Continue with" OIDC button
    And I should not see email and password input fields

  Scenario: OIDC error is displayed on login page
    When I navigate to the login page with an OIDC error
    Then I should see the OIDC error message displayed

  Scenario: OIDC callback with missing flow returns error
    When I request the OIDC callback without a flow cookie
    Then I should be redirected to the login page with a "missing_flow" error

  Scenario: OIDC callback with provider error returns error
    When I request the OIDC callback with an error parameter
    Then I should be redirected to the login page with a "provider_error" error
