Feature: Editor autosave and version conflict
  As a user editing a drawing
  I want my changes to be automatically saved
  So that I do not lose work

  Scenario: Drawing is autosaved after editing
    Given a drawing named "Autosave Test"
    When I open the drawing in the editor
    And I draw a shape on the canvas
    Then the drawing should be saved with the new content

  Scenario: Version conflict is detected on concurrent edit
    Given a drawing named "Conflict Test"
    When I update the drawing with version 1 from the API
    And I update the drawing again with a stale version
    Then the update should fail with a version conflict error
