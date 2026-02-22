Feature: Proxy-aware CSRF validation
  As an operator running behind multiple reverse proxies
  I want CSRF validation to remain stable with the CSRF client cookie
  So legitimate requests continue to work when intermediary proxy hops change

  Scenario: CSRF token stays valid when intermediary proxy hops change
    When I request a proxied CSRF token for client "203.0.113.42" via "10.0.0.5, 172.17.0.3"
    And I submit a proxied drawing create for client "203.0.113.42" via "10.0.0.99, 172.17.0.3"
    Then the proxied drawing create should succeed

  Scenario: CSRF token is rejected when the CSRF cookie changes
    When I request a proxied CSRF token for client "203.0.113.42" via "10.0.0.5, 172.17.0.3"
    And I submit a proxied drawing create without the CSRF cookie for client "198.51.100.24" via "10.0.0.99, 172.17.0.3"
    Then the proxied drawing create should fail with CSRF validation error
