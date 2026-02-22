Feature: Library persistence
  As a user
  I want to save items to the library
  So that I can reuse shapes across drawings

  Scenario: Library panel is available in the editor
    Given the editor is open for a new drawing
    When I open the library
    Then the library panel should be available

  Scenario: Save a library item and persist
    Given the editor is open for a new drawing
    When I save a library item
    Then the library should persist without errors

  Scenario: Import a library via URL hash
    Given the editor is open for a new drawing
    When I import a library from a URL hash
    Then the library import should complete
