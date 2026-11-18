---
paths:
  - "**/*.{test,spec}.{ts,tsx,js,jsx}"
  - "**/__tests__/**"
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/conftest.py"
  - "**/tests/**"
---

# Tests

- Make sure each test fails when the code breaks. A bug fix needs a test that fails without the fix.
- Do not mock the code under test or a security check. Mock only the boundaries: network, time and external services.
- Assert what the user sees or what the code persists, not internals or mock calls.
- Keep tests independent. Reset store state and shared fixtures between tests.
- Do not use fixed sleeps. Wait for a condition.
