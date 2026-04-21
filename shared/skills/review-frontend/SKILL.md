---
name: review-frontend
description: Review the current git diff or pull request changes, focusing only on frontend files such as .tsx, .ts, and .js. Use when the user asks for a frontend code review, PR review, pull request review, React review, TypeScript frontend review, UI-focused review, or asks to review frontend changes before merge.
---

# Frontend Review

Review the current git diff or PR changes, focusing only on frontend files such as `.tsx`, `.ts`, and `.js`.

Goal: find real frontend bugs, regressions, accessibility issues, type-safety problems, performance risks, and maintainability issues without imposing arbitrary preferences.

## Review Method

Follow this order:

1. Understand what changed and why before critiquing it.
2. Read surrounding code to understand the existing patterns.
3. Align feedback with project conventions unless those conventions are actively harmful.
4. Prioritize issues with user impact, correctness, and maintainability over style preferences.
5. Provide concrete fixes, not just criticism.

## Scope

Review the frontend diff against the correct base branch for the work under review.

If the user asks for PR review:

- determine the PR base branch first
- diff against that base branch

If no PR or base branch is specified:

- use the repo's usual review base, often `main`

Example command:

```sh
git diff main --name-only -- '*.tsx' '*.ts' '*.js'
```

Read each changed file fully before reviewing.

Do not review based on the diff alone. Understand the full file context first.

Review only the changed frontend files unless the user explicitly asks for broader review.

Before flagging an issue as a problem, check whether the codebase has an established local pattern. Prefer "this conflicts with project conventions" over generic framework advice when possible.

Analyze each file against the following checklist.

## 1. Component Design

- **Single Responsibility**: Does each component do one thing well? Flag components that mix concerns such as data fetching, rendering, and business logic in one file.
- **Componentization**: Identify JSX blocks that should be extracted into their own component, especially repeated patterns, complex conditional renders, and logical groupings.
- **Props interface**: Are props minimal and well-typed? Flag prop drilling deeper than two levels; suggest Context or composition instead.
- **Component size**: Flag components over about 150 lines of JSX; suggest splitting.

## 2. Hook Extraction

- **Custom hook opportunities**: Identify logic inside components that should be extracted into a custom hook:
  - state plus `useEffect` combinations that form a cohesive unit
  - business logic mixed into the component body
  - reusable stateful logic duplicated across components
  - complex derived state calculations
- **Hook rules**: Verify hooks are not called conditionally or inside loops.
- **useEffect discipline**: Check for missing dependencies, missing cleanup functions, and effects that should be event handlers instead.

## 3. DRY and Reusability

- **Duplicated logic**: Flag similar code blocks across changed files; suggest shared utils or hooks.
- **Duplicated JSX**: Identify repeated markup patterns; suggest shared components.
- **Magic values**: Flag hardcoded strings, numbers, or config that should be constants or come from a config or theme.

## 4. Performance

- **Unnecessary re-renders**: Flag missing `useMemo` or `useCallback` where expensive computations or callback references cause child re-renders.
- **Inline definitions**: Flag objects, arrays, and functions created inside render that could be stable references.
- **List rendering**: Verify `key` props are stable and meaningful, not array index unless the list is static.
- **Lazy loading**: Flag heavy components or routes that should use `React.lazy` or dynamic imports.
- **Over-optimization**: Also flag unnecessary memoization. Do not optimize what is not slow.
- **Bundle impact**: Flag obvious heavy dependencies or large client-side work introduced into hot paths.

## 5. TypeScript and Type Safety

- **`any` usage**: Flag every `any`; suggest proper types.
- **Type assertions**: Flag `as` casts that hide type errors instead of fixing them.
- **Optional chaining abuse**: Flag long `?.` chains that mask potentially broken data; the data shape should be validated upstream.
- **Discriminated unions**: Suggest where a union type would be safer than optional fields.

## 6. State Management

- **State placement**: Is state at the right level? Flag state that should be lifted up or pushed down.
- **Derived state**: Flag `useState` plus `useEffect` combinations that should be `useMemo` or computed inline.
- **Unnecessary state**: Flag state that duplicates props or can be derived from other state.

## 7. Error Handling and Edge Cases

- **Loading, error, empty states**: Are all async states handled: loading, error, empty, success?
- **Null safety**: Flag unguarded access to potentially nullable values.
- **Boundary conditions**: Flag missing edge cases such as empty arrays, `undefined`, and `0` versus falsy.
- **User-visible failures**: Flag places where a failure path will silently fail or leave the UI in an ambiguous state.

## 8. Readability and Naming

- **Naming clarity**: Flag vague names like `data`, `info`, `item`, `handler`, or `handleClick` on non-click events.
- **Boolean naming**: Booleans should read as questions, such as `isLoading`, `hasError`, `canSubmit`.
- **Function naming**: Event handlers should describe what they do, not just the event, such as `handleSaveUser` not `handleClick`.
- **Nesting depth**: Flag deeply nested ternaries or conditionals; suggest early returns or extracted variables.

## 9. Accessibility

- **Interactive elements**: Flag `<div onClick>` without role or keyboard handling; suggest `<button>` or proper ARIA.
- **Form labels**: Flag inputs without associated labels.
- **Alt text**: Flag images without meaningful alt text.
- **Focus behavior**: Flag missing focus management in dialogs, menus, and dynamic UI.
- **Keyboard support**: Flag interactions that work with mouse only.

## Review Principles

- Prefer correctness over cleverness.
- Prefer project consistency over abstract best practice.
- Do not suggest memoization, abstraction, or extraction unless it clearly improves the code.
- Flag real risks first: broken behavior, crashes, bad async handling, inaccessible UI, unsafe types.
- Treat speculative concerns as suggestions, not warnings.
- Always note good decisions you see so the review is balanced and useful.

## Output Format

Write review in terse, direct style. No filler. No long summaries. Prefer fragments when clear.

Pattern per finding:

- severity label: `bug:`, `risk:`, `nit:`, or `q:`
- short reason
- `Suggested change:`
- concrete fix, with code when useful

Group findings by severity:

- 🔴 **Critical**: must fix before merge, such as bugs, broken logic, crashes, security problems, and serious accessibility violations
- 🟡 **Warning**: should fix, creates tech debt or likely regressions, such as poor state management, missing error handling, or unsafe types
- 🟢 **Suggestion**: improvement opportunity, such as hook extraction, componentization, naming, and non-critical performance work

If there are no findings, say that explicitly and mention any residual testing or review gaps.

For each finding include:

1. File and line number
2. The category from the checklist
3. One of `bug:`, `risk:`, `nit:`, or `q:`
4. What is wrong and why it matters, in 1-3 short lines
5. `Suggested change:`
6. Concrete fix, including code when useful

Severity guidance:

- `bug:` broken behavior, incorrect UI logic, crash, invalid hook usage, missing a11y requirement
- `risk:` works now but fragile, likely to regress, unsafe type/path, missing edge-case handling
- `nit:` cleanup, naming, minor extraction, low-risk polish
- `q:` genuine question when intent is unclear; use sparingly

Preferred shape:

```md
## 🔴 Critical

- [file:line] Category
  bug: short statement.
  why: short statement.
  Suggested change:
  ```ts
  // fix
  ```
```

Use `risk:` or `nit:` instead of `bug:` when non-breaking.

End with:

- **What is Done Well**: 1-3 short bullets max
- **Top Fixes**: highest-value issues first, terse
- **Overall Assessment**: merge-ready or not, plus biggest residual risk

## Tone

- Be direct, specific, and constructive.
- Do not lecture.
- Do not nitpick unless the user explicitly asks for exhaustive review.
- Provide code examples when the fix is not obvious.
- Sound closer to `caveman` than to a long-form PR reviewer.

## Anti-Fluff Rules

Do not write:

- "I noticed that..."
- "It seems like..."
- "You might want to consider..."
- "This is just a suggestion..."
- "Looks good overall, but..."
- explanations of what the code already obviously does
- praise inside each finding

Write:

- exact location
- exact symbol names when relevant
- exact problem
- exact fix
- short why only when needed

## Review Discipline

- One finding per root cause. Do not split the same issue into multiple comments.
- Do not comment on unchanged code unless needed to explain a changed-code issue.
- Prefer high-signal findings over exhaustive commentary.
- For obvious fixes, keep `Suggested change:` to one line.
- For non-obvious fixes, include a small code sample.
- If security, major architectural disagreement, or onboarding context requires more explanation, briefly expand, then return to terse format.
