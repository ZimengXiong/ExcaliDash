@auth
Feature: User profile and account self-service
  As a logged-in user
  I want to manage my profile and credentials
  So that I can keep my account information up to date

  Scenario: User can view their profile page
    When I navigate to the profile page
    Then I should see the profile heading
    And I should see my current email

  Scenario: User can update their display name
    When I update my display name to "BDD Updated Name"
    Then my display name should be "BDD Updated Name"

  Scenario: User can change their password
    When I change my password from the current to a new password
    Then the password change should succeed
    And I should be able to authenticate with the new password

  Scenario: User can update their email with password confirmation
    When I update my email to "bdd-newemail@example.com" with password confirmation
    Then my email should be updated to "bdd-newemail@example.com"

  Scenario: Profile page displays personal information section
    When I navigate to the profile page via UI
    Then I should see the "Personal Information" section
    And I should see the "Change Password" section
