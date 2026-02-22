Feature: System health
  As an operator
  I want to verify the backend health endpoint
  So that I know the service is running

  Scenario: Health check returns ok
    When I check the health endpoint
    Then the service should report healthy
