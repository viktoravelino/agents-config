Write a session log, save learnings, and update my daily notes. Do all four steps:

PROJECT RESOLUTION: Determine the current project name from the working directory's repo name (e.g., if cwd is inside `langflow` or `langflow-wxo-fe`, project = "langflow"; if `anima-virtus`, project = "anima-virtus"). Use this as <PROJECT> below. The vault base is "/Users/viktoravelino/Documents/Obsidian Vault".

STEP 1: Create a session log at "<vault>/projects/<PROJECT>/sessions/"
Filename: YYYY-MM-DD-brief-topic-slug.md (use today's date)

Use this format:
---
date: YYYY-MM-DD
project: <PROJECT>
type: session-log
tags: [session, <PROJECT>]
status: in-progress | completed | blocked
---

# Session: [Brief description of what we worked on]

## What was done
- Concrete changes: files modified, features added, bugs fixed
- Include PR numbers if applicable

## Key decisions
- Architectural or design decisions made and the reasoning

## Findings
- Anything surprising or worth remembering
- Gotchas, undocumented behavior, performance insights

## Open threads
- What's unfinished or needs follow-up next session
- Unresolved questions

## Files touched
- List every file created or significantly modified

STEP 2: Save learnings to "<vault>/projects/<PROJECT>/learning/"
Review the session for anything reusable in future work: gotchas, undocumented behavior, patterns that worked, debugging techniques, performance insights, API quirks, tooling tips, etc.
For each distinct learning, create a note in the appropriate subfolder:
- react/ for React/TypeScript/frontend
- python/ for Python/FastAPI/backend
- devops/ for infrastructure, deployment, tooling
- Create a new subfolder if none of these fit

Filename: YYYY-MM-DD-brief-description.md

Use this format:
---
date: YYYY-MM-DD
tags: [finding, <technology-tag>]
project: <PROJECT>
source: claude-code-session
---

# Finding: [Descriptive title]

## Context
How we ran into this — what were we trying to do?

## The finding
What we learned. Be precise.

## Code example
(Include actual code, error messages, or config that demonstrates this)

## Implications
Why this matters for future work. When would someone need to know this?

Make these searchable — include specific error messages, library versions, and function names.
If there are no meaningful learnings from this session, skip this step.

STEP 3: Update today's daily note at "<vault>/projects/<PROJECT>/daily/YYYY-MM-DD.md"
- Append entries to the "Work log" section with tags: #shipped, #reviewed, #debugged, #designed, #mentored, #documented, #presented, #collaborated, #led, #learned
- Add impact-worthy items to "Impact notes" if applicable
- Add people interactions to "Collaboration" using [[Name]] wiki-links
- If the daily note doesn't exist, create it with this structure:

---
date: YYYY-MM-DD
quarter: Q[1-4]
week: [week number]
tags: [daily]
---

# [Day of week, Month Day Year]

## Plan
- [ ]

## Work log
[entries go here]

## Impact notes
-

## Blockers
-

## Learnings
-

## Collaboration
-

STEP 4: Update "/Users/viktoravelino/Documents/Obsidian Vault/CLAUDE.md"
- Rewrite the "Active Context" section with current state for tomorrow's session

Be specific. Use actual file paths, function names, and error messages. Don't summarize — document.