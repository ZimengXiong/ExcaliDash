Feature: Drawing management
  As a user of ExcaliDash
  I want to manage drawings in the dashboard and editor
  So that I can create, edit, and organize my work

  Background:
    Given the dashboard is open

  Scenario: Create a new drawing from the dashboard
    When I create a new drawing
    Then I should see the editor for that drawing
    And the drawing should be stored with the name "Untitled Drawing"

  Scenario: Open an existing drawing
    Given a drawing named "Open Existing"
    When I open the drawing from the dashboard
    Then I should see the editor for that drawing

  Scenario: Rename a drawing from the editor header
    Given a drawing named "Original Name"
    When I rename the drawing to "Updated Name" in the editor header
    Then the drawing name should be "Updated Name"

  Scenario: Return to the dashboard from the editor
    Given a drawing named "Navigation Sample"
    When I return to the dashboard from the editor
    Then I should see the dashboard search input

  Scenario: Draw a rectangle and save
    Given a drawing named "Rectangle Sketch"
    When I draw a rectangle on the canvas
    Then the drawing should contain at least 1 element

  Scenario: Draw text and save
    Given a drawing named "Text Sketch"
    When I draw text "Hello BDD" on the canvas
    Then the drawing should contain at least 1 element

  Scenario: Use undo and redo in the editor
    Given a drawing named "Undo Sample"
    When I draw a rectangle on the canvas
    And I undo and redo the change
    Then the editor should remain responsive

  Scenario: Move a drawing to the trash and restore view
    Given a drawing named "Trash Sample"
    When I move the drawing to the trash
    Then the drawing should appear in the trash view

  Scenario: Permanently delete a drawing from trash
    Given a drawing in the trash named "Permanently Deleted"
    When I permanently delete the drawing from the trash
    Then the drawing should be removed from the system

  Scenario: Duplicate a drawing
    Given a drawing named "Duplicate Source"
    When I duplicate the drawing from the dashboard
    Then I should see two drawings matching "Duplicate Source"

  Scenario: Export a drawing from the card menu
    Given a drawing named "Export Me"
    When I export the drawing from its card menu
    Then the export should complete without error

  Scenario: Export a drawing from the editor toolbar
    Given a drawing named "Export Toolbar"
    When I export the drawing from the editor toolbar
    Then the editor export should show success
