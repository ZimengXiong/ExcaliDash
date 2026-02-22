@auth
Feature: Admin panel and impersonation
  As an admin
  I want to manage users and impersonate them
  So that I can administer the application

  Scenario: Admin can view the user list
    When I navigate to the admin page
    Then I should see the admin heading
    And I should see the users table

  Scenario: Admin can create a new user
    When I create a user with email "bdd-newuser@example.com" and name "BDD New User"
    Then the user "bdd-newuser@example.com" should appear in the user list

  Scenario: Admin can edit a user name
    Given a user exists with email "bdd-edituser@example.com"
    When I update the user name to "Updated Name"
    Then the user should have name "Updated Name"

  Scenario: Admin can toggle user active status
    Given a user exists with email "bdd-activeuser@example.com"
    When I deactivate the user
    Then the user should be inactive
    When I reactivate the user
    Then the user should be active

  Scenario: Admin can set must-reset-password flag
    Given a user exists with email "bdd-resetflag@example.com"
    When I set the must-reset-password flag on the user
    Then the user should have must-reset-password enabled

  Scenario: Admin can force-reset a user password
    Given a user exists with email "bdd-forcereset@example.com"
    When I force-reset the user password
    Then a temporary password should be returned
    And the user should have must-reset-password enabled

  Scenario: Admin can toggle user registration
    When I disable user registration
    Then registration should be disabled
    When I enable user registration
    Then registration should be enabled

  Scenario: Admin can view login rate-limit config
    When I request the login rate-limit config
    Then the rate-limit config should contain window and max values

  Scenario: Admin can update login rate-limit config
    When I update the login rate-limit to 10 requests per 60000 ms
    Then the rate-limit config should reflect the new values

  Scenario: Admin can start impersonating a user
    Given a user exists with email "bdd-impersonate@example.com"
    When I start impersonating the user
    Then the auth session should reflect the impersonated user

  Scenario: Admin can stop impersonating and resume as admin
    Given a user exists with email "bdd-stopimpersonate@example.com"
    And I am impersonating the user
    When I stop impersonating
    Then the auth session should reflect the admin user
