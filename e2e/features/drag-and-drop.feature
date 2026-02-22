Feature: Drag and drop
  As a user
  I want to organize drawings with drag and drop
  So that I can manage collections efficiently

  Background:
    Given the dashboard is open

  Scenario: Move drawing to collection via card menu
    Given a collection named "DnD Collection"
    And a drawing named "DnD Drawing"
    When I move the drawing into collection "DnD Collection" using the drag-and-drop card menu
    Then the drawing should appear in collection "DnD Collection"

  Scenario: Move drawing to Unorganized via card menu
    Given a collection named "Unorganized Collection"
    And a drawing named "Unorganized Drawing"
    And the drawing is in collection "Unorganized Collection"
    When I move the drawing into collection "Unorganized" via drag and drop
    Then the drawing should appear in the unorganized view

  Scenario: Move multiple drawings to a collection via bulk menu
    Given a collection named "Bulk Move"
    And drawings with names:
      | name |
      | Bulk Move A |
      | Bulk Move B |
    When I move the drawings into collection "Bulk Move" using the bulk menu
    Then the drawings should appear in collection "Bulk Move"

  Scenario: Import a drawing via file input
    When I import the fixture file "small-image.excalidraw"
    And I wait for uploads to finish
    Then the drawing "small-image" should appear in the dashboard

  Scenario: Show drop zone overlay on drag
    When I simulate dragging a file into the dashboard
    Then I should see the import drop zone or the import button

  Scenario: Drag-select multiple drawings on the dashboard
    Given drawings exist
    When I drag-select across drawings
    Then all drawings should be selected
