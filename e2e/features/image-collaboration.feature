Feature: Image collaboration
  As a collaborator
  I want pasted images to sync across tabs
  So that everyone sees the same content

  Scenario: Image file data syncs across tabs and persists
    Given a drawing exists named "Image Sync"
    When I open two editor tabs for the drawing
    And I inject an image element and file data in the first tab
    Then the second tab should receive the image file
    And the drawing should persist the image file
