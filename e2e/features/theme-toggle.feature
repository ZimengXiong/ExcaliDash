Feature: Theme toggle
  As a user
  I want to switch between dark and light themes
  So that the interface is comfortable to use

  Scenario: Toggle theme from settings
    Given the settings page is open
    When I toggle the theme
    Then the theme should be updated

  Scenario: Theme persists across navigation
    Given the settings page is open
    When I enable dark mode
    And I navigate to the dashboard
    Then dark mode should remain enabled

  Scenario: Theme persists across reload
    Given the settings page is open
    When I enable dark mode
    And I reload the page
    Then dark mode should remain enabled

  Scenario: Dark theme applies to dashboard
    Given the settings page is open
    When I enable dark mode
    And I navigate to the dashboard
    Then dark theme styling should be applied

  Scenario: Light theme applies to dashboard
    Given the settings page is open
    When I enable light mode
    And I navigate to the dashboard
    Then light theme styling should be applied
