---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# TypeScript

- Do not use `any`. Use `unknown` and narrow it when you do not know the type.
- Prefer inferred types. Do not write a type that restates what TypeScript infers.
- Model states with discriminated unions, not with flag pairs that allow an impossible state.
- Add an exhaustive check to a `switch` on a union.
- Use `satisfies` to check a value and keep its narrow type. Use `as const` for fixed values. Prefer an `as const` object to an `enum`.
- Avoid casts (`as X`, `as unknown as X`, `!`). Fix the type or narrow the value. Do not write one-line functions that only wrap a cast.
- Validate data at a boundary (API response, `JSON.parse`, storage) before you give it a type.
- Use `??` for defaults when `0` or `''` is a valid value.
- Await every promise or handle it on purpose. Do not use `forEach(async ...)`.
- Do not add a generic that has one use.
