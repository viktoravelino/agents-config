---
paths:
  - "**/*.py"
---

# Python

- Do not block the event loop in `async def`. Use async clients, `asyncio.sleep` and async DB calls, or move sync work to a thread.
- Await every coroutine. Keep a reference to every task from `asyncio.create_task`.
- Read `requires-python`. Do not use syntax or behavior newer than that version.
- Group related writes in one transaction. Do not run a query for each item in a loop. Avoid lazy loads in async code.
- In a migration, give a new required column a `server_default` or a backfill. Keep one Alembic head.
- In an API route, apply the same owner and permission filter as the other routes for that resource. Return the same status for "not found" and "not allowed".
- Expose only the fields the client needs in a response model. Limit page size, list length and body size.
- Catch specific exceptions. Do not return exception text to the client. Do not log secrets or raw input values.
- Do not use mutable default arguments. Use timezone-aware `datetime`. Use `is` only for `None` and sentinels.
- Follow the project's ruff config. Do not add `# noqa` to hide a finding.
