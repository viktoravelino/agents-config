# React checks

Read this when the diff touches `.tsx` or `.jsx` files, hooks, stores or query hooks.

## Effects
- An effect that does the job of an event handler. It runs after render and fires twice in strict mode.
- Derived state kept in state and synced by an effect. It shows one stale frame and can loop.
- Missing cleanup: listeners, timers, subscriptions, aborted requests.
- A stale closure: a callback or effect that reads a value from an old render.
- Hook dependencies that need a check by hand, because the lint rule is off.

## Async
- A stale response overwrites a newer one.
- State set after unmount.
- Double submit. The controls stay enabled during a request.

## Client stores (zustand and similar)
- `getState()` inside a memo, effect or render. It is a snapshot. It never updates unless the dependencies cover what it reads.
- A selector that returns a new object or array on each call. It re-renders on every store change.
- State that must reset between screens or sessions and does not.

## Server state (TanStack Query and similar)
- A query key that misses a variable. Two inputs share one cache entry.
- A mutation that does not invalidate what it changes.
- An optimistic update with no rollback.
- Loading or error shown as empty data.
- Per-call `mutate` callbacks do not run after unmount. Use the hook-level callbacks for work that must happen.
- A refetch that overwrites live local state.

## Rendering
Report these only on a hot path, and name the path.

- Index keys on a list that reorders.
- New object or function props that defeat an existing `memo`.
- Heavy work in render.

## Refs
- A ref that hides state the UI must react to. Changing it does not re-render.

## Accessibility
- A clickable element that is not a button and has no keyboard support.
- An input with no label.
- Focus that does not move into a dialog or does not return when it closes.
- An icon-only button with no accessible name.

## i18n
- A hard-coded user-visible string where nearby code translates.
- A new key that is missing from a locale file.

## Tests
- Assert what the user sees, not component internals.
- Reset store state between tests.
- No fixed sleeps in end-to-end tests. Wait for a condition.

## Do not report
- A missing `useMemo` or `useCallback` with no measured cost.
- Component size alone.
- Style.
