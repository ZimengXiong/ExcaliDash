@auth
Feature: Login and registration UI flows
  As a user
  I want to log in and register via the UI
  So that I can access the application

  Scenario: Login page displays the sign-in form
    When I navigate to the login page
    Then I should see the sign-in heading
    And I should see the email input
    And I should see the password input
    And I should see the sign-in button

  Scenario: Login with valid credentials succeeds
    When I log out from the application
    And I submit valid credentials on the login page
    Then I should be redirected to the dashboard

  Scenario: Login with invalid credentials shows error
    When I navigate to the login page
    And I submit invalid credentials on the login page
    Then I should see a login error message

  Scenario: Registration page displays the registration form
    When I navigate to the registration page
    Then I should see the registration heading
    And I should see the registration email input
    And I should see the registration password input
