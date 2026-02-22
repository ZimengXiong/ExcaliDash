Feature: Dashboard workflows
  As a user managing my drawings
  I want bulk actions and collection organization
  So that I can keep drawings organized

  Background:
    Given the dashboard is open

  Scenario: Move a drawing to trash using bulk toolbar
    Given a drawing named "Trash Workflow"
    When I move the drawing to the trash using bulk actions
    Then the drawing should appear in the trash view

  Scenario: Create a collection and move a drawing using card controls
    Given a drawing named "Collection Flow"
    When I create a collection named "Team A"
    And I move the drawing into collection "Team A"
    Then the drawing should appear in collection "Team A"
    And the drawing should not appear in the unorganized view

  Scenario: Duplicate multiple drawings and move them to trash
    Given drawings with names:
      | name |
      | Bulk Flow A |
      | Bulk Flow B |
    When I duplicate the drawings in bulk
    And I move the duplicated drawings to trash
    Then 4 drawings named "Bulk Flow" should be in the trash

  Scenario: Keyboard selection selects all drawings
    Given drawings exist
    When I select all drawings using the keyboard
    Then all drawings should be selected
    When I clear the selection with escape
    Then no drawings should be selected
