Review the current git diff against main, focusing ONLY on frontend files (.tsx, .ts, .js).

Run `git diff main --name-only -- '*.tsx' '*.ts' '*.js'` to get the changed files. Read each one fully before reviewing — do not review based on the diff alone, understand the full file context.

Analyze each file against the following checklist:

## 1. Component Design
- **Single Responsibility**: Does each component do one thing well? Flag components that mix concerns (e.g., data fetching + rendering + business logic in one file)
- **Componentization**: Identify JSX blocks that should be extracted into their own component (repeated patterns, complex conditional renders, logical groupings)
- **Props interface**: Are props minimal and well-typed? Flag prop drilling deeper than 2 levels — suggest Context or composition instead
- **Component size**: Flag components over ~150 lines of JSX — suggest splitting

## 2. Hook Extraction
- **Custom hook opportunities**: Identify logic inside components that should be extracted into a custom hook:
  - State + useEffect combos that form a cohesive unit
  - Business logic mixed into the component body
  - Reusable stateful logic duplicated across components
  - Complex derived state calculations
- **Hook rules**: Verify hooks aren't called conditionally or inside loops
- **useEffect discipline**: Check for missing dependencies, missing cleanup functions, effects that should be event handlers instead

## 3. DRY & Reusability
- **Duplicated logic**: Flag similar code blocks across changed files — suggest shared utils or hooks
- **Duplicated JSX**: Identify repeated markup patterns — suggest shared components
- **Magic values**: Flag hardcoded strings, numbers, or config that should be constants or come from a config/theme

## 4. Performance
- **Unnecessary re-renders**: Flag missing `useMemo`/`useCallback` where expensive computations or callback references cause child re-renders
- **Inline definitions**: Flag objects/arrays/functions created inside render that could be stable references
- **List rendering**: Verify `key` props are stable and meaningful (not array index unless static list)
- **Lazy loading**: Flag heavy components/routes that should use `React.lazy` or dynamic imports
- **Over-optimization**: Also flag unnecessary memoization — don't optimize what isn't slow

## 5. TypeScript & Type Safety
- **`any` usage**: Flag every `any` — suggest proper types
- **Type assertions**: Flag `as` casts that hide type errors instead of fixing them
- **Optional chaining abuse**: Flag long `?.` chains that mask potentially broken data — the data shape should be validated upstream
- **Discriminated unions**: Suggest where a union type would be safer than optional fields

## 6. State Management
- **State placement**: Is state at the right level? Flag state that should be lifted up or pushed down
- **Derived state**: Flag `useState` + `useEffect` combos that should be `useMemo` or computed inline
- **Unnecessary state**: Flag state that duplicates props or can be derived from other state

## 7. Error Handling & Edge Cases
- **Loading/error/empty states**: Are all async states handled (loading, error, empty, success)?
- **Null safety**: Flag unguarded access to potentially nullable values
- **Boundary conditions**: Flag missing edge cases (empty arrays, undefined, 0 vs falsy)

## 8. Readability & Naming
- **Naming clarity**: Flag vague names (data, info, item, handler, handleClick on non-click events)
- **Boolean naming**: Booleans should read as questions: `isLoading`, `hasError`, `canSubmit`
- **Function naming**: Event handlers should describe what they do, not just the event: `handleSaveUser` not `handleClick`
- **Nesting depth**: Flag deeply nested ternaries or conditionals — suggest early returns or extracted variables

## 9. Accessibility
- **Interactive elements**: Flag `<div onClick>` without role/keyboard handling — suggest `<button>` or proper ARIA
- **Form labels**: Flag inputs without associated labels
- **Alt text**: Flag images without meaningful alt text

## Output format

Group findings by severity:

🔴 **Critical** — must fix before merge (bugs, broken logic, security, accessibility violations)
🟡 **Warning** — should fix, creates tech debt (DRY violations, missing types, poor state management)
🟢 **Suggestion** — improvement opportunity (hook extraction, componentization, naming, performance)

For each finding:
1. File and line number
2. The category from the checklist above
3. The specific code
4. What's wrong and why it matters
5. Suggested fix (show the code)

End with a **Summary** section: what's good about the changes, the top 3 things to fix, and an overall assessment.