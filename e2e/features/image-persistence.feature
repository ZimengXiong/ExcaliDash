Feature: Image persistence and security
  As a user
  I want images to persist safely
  So that my drawings remain intact and secure

  Scenario: Large image data persists through save/reload
    When I create a drawing with a large image
    Then the drawing should preserve the image data

  Scenario: Imported image fixture persists
    When I import an image fixture drawing
    Then the drawing should preserve the embedded image

  Scenario: Multiple images of varying sizes are preserved
    When I create a drawing with multiple image sizes
    Then the drawing should preserve all images

  Scenario: Block javascript URLs in image data
    When I submit a drawing with a javascript image URL
    Then the image data should be sanitized

  Scenario: Block script tags in image data
    When I submit a drawing with a script tag in image data
    Then the image data should be sanitized
