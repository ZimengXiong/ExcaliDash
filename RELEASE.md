# ExcaliDash v0.1.5

Date: 2025-11-23

Compatibility: v0.1.x (Backward Compatible)

# Security

- RCE: implemented strict Zod schema validation and input sanitization on file uploads; added path traversal guards to file handling logic

- XSS: used DOMPurify for HTML sanitization; blocked execution-capable SVG attributes and enforces CSP headers.

- DoS: moved CPU-intensive operations to worker threads to prevent event loop blocking; request rate limiting (1,000 req/15 min per IP) and streaming for large files

# Infras & Deployment

- non-root execution (uid 1001) in containers
- migrated to multi-stage Docker builds

# Database

- migrated to better-sqlite3, converted all DB interactions to non-blocking async operations and offloaded integrity checks to worker threads.

- implemented SQLite magic header validation; added automatic backup triggers preceding data import

- input validation logic

# Frontend

- updated Settings UI to show version
