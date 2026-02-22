Feature: Upload status indicator
  As a user importing drawings
  I want to see upload progress
  So that I know when imports are complete

  Background:
    Given the dashboard is open

  Scenario: Successful import shows upload complete status
    When I import a drawing file named "Upload_Status_Test"
    And I wait for uploads to finish
    Then I should see the drawing "Upload_Status_Test" in the dashboard

  Scenario: Multiple imports show progress for each file
    When I import multiple drawings named "Upload_Multi"
    And I wait for uploads to finish
    Then I should see 2 drawings matching "Upload_Multi"
