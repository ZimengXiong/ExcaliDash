Feature: Collaboration
  As a collaborator
  I want real-time collaboration
  So that multiple users can edit drawings together

  Scenario: Presence indicator appears for multiple users
    Given a drawing exists named "Collab Presence"
    When two users open the drawing
    Then a collaborator indicator should be visible

  Scenario: Drawing changes sync between users
    Given a drawing exists named "Collab Sync"
    When two users draw on the same canvas
    Then the drawing should contain at least 1 element

  Scenario: Drawing persists across reload
    Given a drawing exists named "Collab Persist"
    When I draw a rectangle and reload the editor
    Then the drawing should contain at least 1 element

  Scenario: Cursor updates do not error
    Given a drawing exists named "Collab Cursor"
    When two users move their cursors
    Then the collaboration session should remain active
