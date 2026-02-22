Feature: Export and import
  As a user
  I want to export and import my drawings and data
  So that I can back up and restore information

  Scenario: Export SQLite from settings
    Given the settings page is open
    When I view export options
    Then I should see the SQLite export option

  Scenario: Export JSON from settings
    Given the settings page is open
    When I view export options
    Then I should see the JSON export option

  Scenario: Export ZIP from API
    Given a drawing exists named "Export API"
    When I request the JSON export endpoint
    Then I should receive a zip export response

  Scenario: Export SQLite from API
    Given a drawing exists named "SQLite Export"
    When I request the SQLite export endpoint
    Then I should receive a SQLite export response

  Scenario: Export DB from API
    Given a drawing exists named "DB Export"
    When I request the DB export endpoint
    Then I should receive a DB export response

  Scenario: Import drawings via dashboard
    Given the dashboard is open
    When I import a drawing file named "Import_Excalidraw"
    And I wait for uploads to finish
    Then I should see the drawing "Import_Excalidraw" in the dashboard

  Scenario: Import JSON drawing via dashboard
    Given the dashboard is open
    When I import a json drawing file named "Import_JSON"
    And I wait for uploads to finish
    Then I should see the drawing "Import_JSON" in the dashboard

  Scenario: Import invalid file shows failure
    Given the dashboard is open
    When I import an invalid drawing file
    And I wait for uploads to finish
    Then I should see the import failure status

  Scenario: Unsupported library import shows error
    Given the dashboard is open
    When I import an unsupported library file
    And I wait for uploads to finish
    Then I should see the unsupported library import error

  Scenario: Import multiple drawings
    Given the dashboard is open
    When I import multiple drawings named "Import_Multi"
    And I wait for uploads to finish
    Then I should see 2 drawings matching "Import_Multi"

  Scenario: Verify database import endpoint
    When I verify the database import endpoint
    Then the database import verification should respond with an error
