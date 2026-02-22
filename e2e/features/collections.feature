Feature: Collections management
  As a user
  I want to manage collections
  So that my drawings stay organized

  Background:
    Given the dashboard is open

  Scenario: Rename a collection
    Given a collection named "Renamed Collection"
    When I rename the collection to "Renamed Collection Updated"
    Then the collection should be renamed to "Renamed Collection Updated"

  Scenario: Delete a collection and unorganize drawings
    Given a collection named "Delete Collection"
    And a drawing named "Collection Drawing"
    When I move the drawing into collection "Delete Collection"
    And I delete the collection
    Then drawings from the collection should be unorganized

  Scenario: Import a JSON drawing from settings
    When I open the settings page
    And I import a JSON drawing via settings
    Then the imported drawing should be visible on the dashboard

  Scenario: Import a backup archive from settings
    When I import a backup file
    And I confirm the backup import
    Then the backup import should succeed
