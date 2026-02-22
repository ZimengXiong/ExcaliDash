@auth
Feature: Authentication flows
  As an admin
  I want authentication guardrails
  So that access is controlled safely

  Scenario: Auth status reports authentication enabled
    When I check the auth status
    Then authentication should be enabled

  Scenario: Admin can manage user roles
    When I create a standard user
    And I promote the user to admin
    Then the user role should be admin
    When I demote the user to standard
    Then the user role should be standard

  Scenario: Admin can logout from the app
    When I logout from the app
    Then I should be on the login page
