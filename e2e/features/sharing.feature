@auth
Feature: Drawing sharing
  As a user
  I want to share drawings with other users and via links
  So that I can collaborate with others

  Background:
    Given a drawing named "Shared Drawing"

  Scenario: Grant a named user view access to a drawing
    Given a second user exists
    When I grant the second user view access to the drawing
    Then the drawing sharing should list the second user with view access

  Scenario: Grant a named user edit access to a drawing
    Given a second user exists
    When I grant the second user edit access to the drawing
    Then the drawing sharing should list the second user with edit access

  Scenario: Change a named user permission from view to edit
    Given a second user exists
    And the second user has view access to the drawing
    When I change the second user permission to edit
    Then the drawing sharing should list the second user with edit access

  Scenario: Revoke a named user access to a drawing
    Given a second user exists
    And the second user has view access to the drawing
    When I revoke the second user access to the drawing
    Then the drawing sharing should not list the second user

  Scenario: Create a view link share
    When I create a view link share for the drawing
    Then the drawing should have an active view link share

  Scenario: Create an edit link share
    When I create an edit link share for the drawing
    Then the drawing should have an active edit link share

  Scenario: Revoke a link share
    Given a view link share exists for the drawing
    When I revoke the link share
    Then the drawing should have no active link shares

  Scenario: Access a shared drawing via link share
    Given a view link share exists for the drawing
    When an unauthenticated user accesses the shared drawing
    Then the shared drawing should be accessible

  Scenario: Shared drawings appear in shared with me list
    Given a second user exists
    And the second user has view access to the drawing
    When I list drawings shared with the second user
    Then the shared drawings list should include the drawing

  Scenario: Search for users to share with via resolve endpoint
    Given a second user exists
    When I search for users to share the drawing with
    Then the resolve results should include the second user
