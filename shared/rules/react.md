---
paths:
  - "**/*.{tsx,jsx}"
  - "**/use*.{ts,js}"
---

# React

- Do not use an effect to do the job of an event handler. Put the logic in the handler.
- Do not copy derived values into state. Calculate them during render.
- Clean up every effect that adds a listener, a timer, a subscription or a request.
- Keep server state in the query library (TanStack Query). Put every input in the query key. Invalidate what a mutation changes.
- In zustand, select the smallest value you need. Do not return a new object or array from a selector without `useShallow`.
- Do not add `useMemo`, `useCallback` or `memo` without a measured cost.
- Use stable keys from the data, not the index, for a list that can change order.
- Use the project's design-system components (`Button`, `Input`, dialogs) before raw HTML elements.
- When no component fits, use semantic HTML: a `<button>` for click actions, never a `div` or `span` with `onClick`.
- Give every input a label and every icon-only button an accessible name, also when you use a design-system component.
- Use the project's i18n for user-visible text when nearby code does.
