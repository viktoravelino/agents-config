---
name: html-plan
description: Direct-invocation specialist for clear, self-contained HTML plans. It keeps the source material and improves hierarchy, sequence, ownership, dependencies, and reviewability. The user invokes it explicitly with /html-plan; the agent never loads it automatically.
argument-hint: "[plan file or notes to turn into a plan]"
disable-model-invocation: true
---

# HTML Plan

Turn source material into a plan that people can inspect and act on. Keep the user's scope, ordering, commitments, and terminology, unless the user asks for broader synthesis.

## Shape the document around the work

Before you design, read the conversation, the project instructions, and the supplied plan. If an existing design language is present, match it. If not, derive a quiet, workmanlike direction from the audience and subject.

When [`design-artifact`](../design-artifact/SKILL.md) is available, read its
fundamentals to make that direction intentional. The traceability and
source-preservation rules of this skill have priority. Creative direction must
not inflate the plan into a dashboard or campaign page.

Decide what the plan needs:

- phases or sequence;
- status and decision points;
- owners and collaborators;
- dependencies and risks;
- acceptance checks;
- unresolved questions.

Do not add a timeline, progress percentage, status badge, or dashboard summary, unless the source supports it. Improve grammar and structure, but do not inflate an implementation plan into a strategy document.

## Preserve traceability

- Keep the source commitments recognizable.
- Keep accepted decisions separate from assumptions and open questions.
- Show sequence and dependency only where they are real.
- Use tables for exact mappings, comparisons, or repeated fields.
- Use a flow or timeline only when it makes the order much easier to understand.
- Keep long prose readable. Do not force every paragraph into a card.

## Build and verify

Deliver one responsive, accessible, self-contained HTML file. Use semantic headings, lists, tables, and landmarks. Keep essential CSS and JavaScript inline. Do not use external services. Make any navigation or disclosure keyboard-operable.

Inspect the result at wide and narrow widths. Check these points:

- No commitment disappeared.
- The stages stay in the intended order.
- Ownership and dependencies are legible.
- Long content does not overflow.

Return the absolute path. Note any structural interpretation that you introduced.
