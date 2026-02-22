Feature: System update check
  As an operator
  I want to check for available updates
  So that I know when a new version is available

  Scenario: Stable update check returns current version
    When I check for stable updates
    Then the update response should contain the current version
    And the update response should indicate the stable channel

  Scenario: Pre-release update check returns current version
    When I check for pre-release updates
    Then the update response should contain the current version
    And the update response should indicate the prerelease channel

  Scenario: Update check reports outbound status
    When I check for stable updates
    Then the update response should report outbound enabled status
