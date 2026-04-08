Create a findings note for something we just discovered or learned.

PROJECT RESOLUTION: Determine the current project name from the working directory's repo name (e.g., if cwd is inside `langflow` or `langflow-wxo-fe`, project = "langflow"; if `anima-virtus`, project = "anima-virtus"). Use this as <PROJECT> below. The vault base is "/Users/viktoravelino/Documents/Obsidian Vault".

Save to "<vault>/projects/<PROJECT>/learning/" in the appropriate subfolder:
- react/ for React/TypeScript/frontend findings
- python/ for Python/FastAPI/backend findings
- devops/ for infrastructure, deployment, tooling findings
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
(Include the actual code, error message, or config that demonstrates this)

## Implications
Why this matters for future work. When would someone need to know this?

Make this searchable — include specific error messages, library versions,
and function names that someone would grep for.