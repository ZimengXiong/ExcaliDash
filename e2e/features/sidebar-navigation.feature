Feature: Sidebar navigation
  As a user
  I want to navigate using the sidebar
  So that I can filter and organize my drawings view

  Background:
    Given the dashboard is open

  Scenario: Click All Drawings in sidebar shows all drawings
    Given a drawing named "Sidebar All"
    When I click "All Drawings" in the sidebar
    Then I should see drawings on the dashboard

  Scenario: Click Unorganized in sidebar filters to unorganized drawings
    Given a drawing named "Sidebar Unorganized"
    When I click "Unorganized" in the sidebar
    Then I should see the drawing "Sidebar Unorganized" on the dashboard

  Scenario: Click a collection in sidebar filters to that collection
    Given a collection named "Sidebar Collection"
    And a drawing named "Sidebar Collected"
    And the drawing is moved into collection "Sidebar Collection"
    When I click collection "Sidebar Collection" in the sidebar
    Then I should see the drawing "Sidebar Collected" on the dashboard

  Scenario: Click Trash in sidebar shows trashed drawings
    Given a drawing named "Sidebar Trashed"
    And the drawing is moved to trash
    When I click "Trash" in the sidebar
    Then I should see the drawing "Sidebar Trashed" on the dashboard

  Scenario: Click Shared with me in sidebar shows shared drawings
    When I click "Shared with me" in the sidebar
    Then I should see the shared drawings view
