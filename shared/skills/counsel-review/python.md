# Python checks

Read this when the diff touches `.py` files, migrations or `pyproject.toml`.

## Async
- Blocking I/O in `async def`: `requests`, `time.sleep`, sync file or DB calls. It stalls the whole event loop.
- A coroutine that is never awaited.
- `asyncio.create_task` with no reference kept. The task can be collected before it ends.
- Work scheduled as a FastAPI background task is dropped when the handler raises.
- Asyncio objects (locks, queues, clients) bound to one event loop.

## Supported versions
- Read `requires-python`. Flag syntax or behavior newer than the floor.
- Example: `asyncio.TimeoutError` versus the builtin `TimeoutError` before 3.11.

## Sessions and transactions
- A `yield` while a session is open.
- A side effect after `commit()` that sits inside the `try` that maps errors.
- Several writes with no transaction.
- A lazy load in async code.
- A query per item.

## Migrations
- More than one head.
- A new required column with no `server_default` or backfill. Say what happens to existing rows.
- A downgrade that loses data.

## API (FastAPI, Pydantic)
- Every route that loads the same resource applies the same owner and permission filter.
- Denials have the same shape. A 403 where other routes return 404 leaks that the resource exists.
- A response model that leaks a field.
- A validation error that logs input values.
- Unbounded input: page size, list length, body size.

## Errors
- A broad `except` that swallows the error.
- Exception text returned to the client.
- Secrets in logs.

## Language traps
- Mutable default arguments.
- Late-binding closures in loops.
- `is` where `==` is correct.
- Mutation of a dict during iteration.
- Naive `datetime`.
- Truthiness on `0` or an empty collection.

## Types
- Check whether a type checker runs at all. If none does, trace `Optional` values by hand.

## Tests
- A test that still passes with the fix replaced by `pass`.
- A mock of the code under test, or of a security check.
- Fixtures that share state.
- Assert persisted values, not mocks.

## Do not report
- Anything the configured ruff rules catch.
- Docstring style.
- Type annotations for their own sake.
