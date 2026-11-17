# TypeScript checks

Read this when the diff touches `.ts` or `.tsx` files.

## Compiler setup
- Check first: is `strict` or `noImplicitAny` on, and does CI run `tsc`?
- If not, run `tsc --noEmit` yourself. Report implicit `any` and new type errors in changed files.

## Casts
- Look for casts that hide a mismatch: `as X`, `as unknown as X` and the non-null `!`.
- Trace the value. Can it really be the other shape?

## Types that lie at a boundary
- A typed API response that nothing validates.
- A field that is required in the type and optional in the backend schema.

## Unions
- A `switch` with no exhaustive check, when a member was added.
- Flag pairs that allow an impossible state. Report them only when a bug is reachable.

## Truthiness
- `||` where `??` is correct, for `0` or `''`.
- `if (value)` on a number.

## Promises
- A floating promise. A missing `await`.
- `forEach(async ...)`. The loop does not wait.
- `Promise.all` with no handling of one rejection.

## Drift
- A constant, regex or enum copied from another package or from the backend. The copies diverge.

## Lean
- A one-line function that only wraps a cast.
- A generic with one use.
- An `enum` where `as const` works.
- A type that restates an inferred type.

## Do not report
- Explicit `any` when lint blocks it.
- Formatting.
- Import order.
