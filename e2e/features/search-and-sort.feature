Feature: Search and sort drawings
  As a user searching drawings
  I want to filter and sort results
  So that I can find drawings quickly

  Background:
    Given the dashboard is open

  Scenario: Filter drawings by search term
    Given drawings with names:
      | name |
      | Search Alpha |
      | Search Beta |
      | Search Gamma |
    When I search for "Search"
    Then I should see 3 drawings matching "Search"

  Scenario: Show empty state when no drawings match search
    Given a drawing named "Existing Drawing"
    When I search for "NonExistentDrawingName12345"
    Then I should see the empty search state for "NonExistentDrawingName12345"

  Scenario: Clear search and show all drawings
    Given drawings with names:
      | name |
      | ClearSearch One |
      | ClearSearch Two |
    When I search for "ClearSearch One"
    And I clear the search
    Then I should see drawings matching "ClearSearch"

  Scenario: Focus search with keyboard shortcut
    When I press the search keyboard shortcut
    Then the search input should be focused

  Scenario: Sort drawings by name
    Given drawings with names:
      | name |
      | Sort Bravo |
      | Sort Alpha |
      | Sort Charlie |
    When I sort drawings by "Name"
    Then the first drawing should be "Sort Alpha"

  Scenario: Toggle sort direction by clicking name sort twice
    Given drawings with names:
      | name |
      | Sort AAA |
      | Sort ZZZ |
    When I toggle sort "Name" twice
    Then the first drawing should be "Sort ZZZ"

  Scenario: Sort drawings by date created
    Given drawings with names:
      | name |
      | Date First |
      | Date Second |
    When I sort drawings by "Date Created"
    Then the first drawing should be "Date Second"

  Scenario: Sort drawings by date modified
    Given drawings with names:
      | name |
      | Modified One |
      | Modified Two |
    When I sort drawings by "Date Modified"
    Then the "Date Modified" sort should be active
